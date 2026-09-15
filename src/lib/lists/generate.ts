/**
 * Pure logic for the Lists + Timeline feature, kept out of any "use server"
 * action so it can be unit-tested directly (see docs/HANDOFF.md section 8 —
 * "put the rule in lib/, import it into the action, test it directly").
 *
 * Three independent pieces, all pure functions over plain dates:
 *   - offset-to-date generation for the timeline template
 *   - recurrence: computing a spawned item's next occurrence
 *   - natural-language quick-add parsing
 *
 * Dates are all `date` columns (calendar dates, no time, no timezone) — the
 * arithmetic below is deliberately done against UTC-midnight `Date` objects
 * and formatted back to `YYYY-MM-DD`, never against a `Date`'s local getters,
 * so it produces the same answer no matter which timezone the server runs in.
 */

// ---------------------------------------------------------------------------
// Calendar date helpers
// ---------------------------------------------------------------------------

function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date, UTC, as `YYYY-MM-DD`. Accepts a clock for tests. */
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
}

export function addDays(dateIso: string, days: number): string {
  const d = parseIsoDate(dateIso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** Clamps day-of-month overflow (31 Jan + 1 month -> 28/29 Feb, not 3 Mar). */
export function addMonths(dateIso: string, months: number): string {
  const d = parseIsoDate(dateIso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const daysInTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, daysInTarget));
  return toIsoDate(target);
}

// ---------------------------------------------------------------------------
// Timeline template generation
// ---------------------------------------------------------------------------

export type TemplateItem = { title: string; offset_days: number; note?: string };
export type TemplateSection = { section: string; items: TemplateItem[] };

export type GeneratedListItem = {
  /** Unique per item, stable across regeneration — what (wedding_id, template_key) upserts on. */
  template_key: string;
  section: string;
  title: string;
  notes: string | null;
  due_date: string;
  offset_days: number;
  /**
   * True when the computed due_date falls before `today`. Deliberately NOT a
   * clamp of the date itself — the spec's "explicit overdue-on-import state"
   * is this flag, so the UI can surface it plainly, rather than a silently
   * wrong (moved-to-today) date that no longer matches offset_days.
   */
  overdue_on_import: boolean;
};

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

/** Stable per-item key: the template's own key plus a slug of the item, disambiguated by offset. */
export function templateItemKey(templateKey: string, title: string, offsetDays: number): string {
  return `${templateKey}:${slugify(title)}:${offsetDays}`;
}

/**
 * Given a wedding date and a template's sections, compute the real due_date
 * for every item. Returns [] for a null wedding date rather than throwing —
 * `/setup/plan` renders an empty state for that case (open question 7), and
 * this keeps the function total instead of pushing a null check onto every
 * caller.
 */
export function generateTimelineItems(
  templateKey: string,
  weddingDate: string | null,
  sections: TemplateSection[],
  today: string = todayIso(),
): GeneratedListItem[] {
  if (!weddingDate) return [];
  return sections.flatMap((section) =>
    section.items.map((item) => {
      const due_date = addDays(weddingDate, item.offset_days);
      return {
        template_key: templateItemKey(templateKey, item.title, item.offset_days),
        section: section.section,
        title: item.title,
        notes: item.note ? item.note : null,
        due_date,
        offset_days: item.offset_days,
        overdue_on_import: due_date < today,
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

export type RepeatFrequency = "daily" | "weekly" | "monthly";

export type RepeatEnd =
  | { type: "never" }
  | { type: "after"; count: number }
  | { type: "until"; date: string };

export type RepeatRule = {
  freq: RepeatFrequency;
  /** Every N days/weeks/months, depending on freq. */
  interval: number;
  /** Weekly only. 0 = Sunday .. 6 = Saturday. Empty/absent = every `interval` weeks on the same weekday. */
  weekdays?: number[];
  /** Monthly only. 1-31, clamped to the shorter month. Absent = same day-of-month as the current occurrence. */
  day_of_month?: number;
  end: RepeatEnd;
  /** 1 for the item that first carried this rule; incremented on every spawn. */
  occurrence_index: number;
};

function nextWeeklyDate(fromIso: string, rule: RepeatRule): string {
  const weekdays = rule.weekdays?.length ? rule.weekdays : null;
  if (!weekdays) return addDays(fromIso, 7 * rule.interval);

  // Smallest date after `fromIso` whose weekday is in the set, capped well
  // beyond any single interval so a sparse weekday set still resolves.
  const sorted = [...weekdays].sort((a, b) => a - b);
  for (let offset = 1; offset <= 7 * rule.interval + 7; offset++) {
    const candidate = addDays(fromIso, offset);
    const dow = parseIsoDate(candidate).getUTCDay();
    if (sorted.includes(dow)) return candidate;
  }
  // Unreachable for a valid rule (every weekday set has a match within a week).
  return addDays(fromIso, 7 * rule.interval);
}

/** The next due_date after `fromIso`, per the rule's pattern. Does not check the end condition. */
export function computeNextDueDate(fromIso: string, rule: RepeatRule): string {
  switch (rule.freq) {
    case "daily":
      return addDays(fromIso, rule.interval);
    case "weekly":
      return nextWeeklyDate(fromIso, rule);
    case "monthly": {
      if (rule.day_of_month) {
        const stepped = addMonths(fromIso, rule.interval);
        const d = parseIsoDate(stepped);
        const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
        d.setUTCDate(Math.min(rule.day_of_month, daysInMonth));
        return toIsoDate(d);
      }
      return addMonths(fromIso, rule.interval);
    }
  }
}

/** Whether a next occurrence should be spawned, given the rule that produced `nextDueIso`. */
export function shouldSpawnNext(rule: RepeatRule, nextDueIso: string): boolean {
  switch (rule.end.type) {
    case "never":
      return true;
    case "after":
      return rule.occurrence_index < rule.end.count;
    case "until":
      return nextDueIso <= rule.end.date;
  }
}

export type RecurringItem = { due_date: string; repeat_rule: RepeatRule };

/**
 * Completing a recurring item spawns a new row for the next occurrence and
 * leaves the completed row as history (spec 1, section 5a) — this computes
 * what that new row's due_date and repeat_rule should be, or null when the
 * rule's end condition means there is no next occurrence.
 */
export function spawnNextOccurrence(current: RecurringItem): RecurringItem | null {
  const nextDueDate = computeNextDueDate(current.due_date, current.repeat_rule);
  if (!shouldSpawnNext(current.repeat_rule, nextDueDate)) return null;
  return {
    due_date: nextDueDate,
    repeat_rule: { ...current.repeat_rule, occurrence_index: current.repeat_rule.occurrence_index + 1 },
  };
}

// ---------------------------------------------------------------------------
// Natural-language quick-add parsing
// ---------------------------------------------------------------------------

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function nextWeekdayFrom(todayIsoDate: string, targetDow: number): string {
  const current = parseIsoDate(todayIsoDate).getUTCDay();
  const delta = ((targetDow - current + 7) % 7) || 7; // a same-named weekday always means next week's
  return addDays(todayIsoDate, delta);
}

type Matcher = {
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, todayIsoDate: string) => string;
};

const MATCHERS: Matcher[] = [
  { pattern: /\bin\s+(\d+)\s+days?\b/i, resolve: (m, t) => addDays(t, Number(m[1])) },
  { pattern: /\bin\s+(\d+)\s+weeks?\b/i, resolve: (m, t) => addDays(t, Number(m[1]) * 7) },
  { pattern: /\bin\s+(\d+)\s+months?\b/i, resolve: (m, t) => addMonths(t, Number(m[1])) },
  { pattern: /\btoday\b/i, resolve: (_m, t) => t },
  { pattern: /\btomorrow\b/i, resolve: (_m, t) => addDays(t, 1) },
  { pattern: /\bnext week\b/i, resolve: (_m, t) => addDays(t, 7) },
  { pattern: /\bnext month\b/i, resolve: (_m, t) => addMonths(t, 1) },
  {
    pattern: new RegExp(`\\bnext\\s+(${WEEKDAYS.join("|")})\\b`, "i"),
    resolve: (m, t) => nextWeekdayFrom(t, WEEKDAYS.indexOf(m[1]!.toLowerCase())),
  },
  {
    // A bare weekday, e.g. "Confirm caterer friday" — always the upcoming one.
    pattern: new RegExp(`\\b(${WEEKDAYS.join("|")})\\b`, "i"),
    resolve: (m, t) => nextWeekdayFrom(t, WEEKDAYS.indexOf(m[1]!.toLowerCase())),
  },
];

export type QuickAddResult = { title: string; due_date: string | null };

/**
 * Parses a phrase like "tomorrow" or "next Friday" out of a quick-add title
 * into a real due_date, the same way Apple Reminders does — or falls back to
 * no date for anything it doesn't recognise, rather than guessing.
 */
export function parseQuickAdd(input: string, today: Date = new Date()): QuickAddResult {
  const todayIsoDate = todayIso(today);
  const trimmedInput = input.trim();

  for (const { pattern, resolve } of MATCHERS) {
    const match = trimmedInput.match(pattern);
    if (!match) continue;
    const due_date = resolve(match, todayIsoDate);
    const title = (trimmedInput.slice(0, match.index) + trimmedInput.slice(match.index! + match[0].length))
      .replace(/\s{2,}/g, " ")
      .trim();
    return { title: title || trimmedInput, due_date };
  }

  return { title: trimmedInput, due_date: null };
}
