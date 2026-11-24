# Feature spec: The on-the-day master

**Status: built, session 61 (migration `0054`; see Build status at the end).** Asked for as a spec (2026-11-23), as the
other half of spec 54. Every question is answered (§11); announcements, Go
cues, escalation and the wider readiness check were added on 2026-11-24 from
spec 54 §18's pass over the leading tools. Nothing is built until the planner
says to build it (see `docs/specs/README.md`).

**Depends on:** spec 54 (day links, whose writes this shows), spec 50 (run
sheet, including items that start when another ends), spec 39 (planner
login), spec 41 (app shell), spec 48 (phone).

## 1. What was asked

1. One master screen for the couple and the planner on the day.
2. Every button a helper taps on their day link (Start, Done, Running late,
   Need help, Can't do it, notes) feeds into it.
3. Mobile first, with a beautiful, clear experience.

## 2. Story

> **As the planner**, walking around the venue on the day, **I want** one
> screen on my phone that tells me what's happening now, who's on it, who's
> late and who needs help, and lets me answer, reassign or push the schedule
> back in a tap, **so that** I run the day from my pocket instead of a
> clipboard.
>
> **As the couple**, **I want** to glance at how the day is going, or hand
> all of it to our planner and not be disturbed.

## 3. Who sees it

The master is for **collaborators** (the couple) and anyone with a **planner
login** (spec 39). It lives at `/day`, under "The day" in the sidebar, and on
the phone tab bar on the wedding day itself, in place of Today.

Helpers never see it. They have their day link (spec 54).

## 4. Principles

The master follows spec 54's principles (§4) and look (§5), with two
differences:

- It is busier by nature, so it is built from **cards**, newest problem
  first, and every card has one obvious action.
- **Problems come first.** Anything that needs a person sits at the top until
  someone deals with it. Everything going to plan is quiet.

## 5. The screen, top to bottom

### 5.1 Alerts

A stack of cards, newest first. Each one stays until it is dealt with:

| Alert | Raised when | Actions |
| --- | --- | --- |
| **Help** (red) | a helper taps Need help | **Answer** (quick answers: "On my way", "Sorting it", "Call me", or a line of text), **Call**, **I'll take it** (assigns the task to the person answering) |
| **Handed back** (amber) | a helper taps Can't do it | **Reassign** (pick anyone, who sees it on their link at once), **I'll do it** |
| **Not started** (amber; red for a critical task) | a task is 5 minutes past its start (a critical task: at its start, spec 54 §10.1) and nobody on it has tapped Start | **Call** them, **Mark started**, **Dismiss** |
| **Running late** (amber) | a helper reports late | **Shift the schedule** (§5.4), **OK** |

A helper's photo (spec 54 §6.10) shows on its alert as a thumbnail that
opens full size.

Answering a help request writes the answer to that request (spec 54 §9); the
helper's banner shows it. Every alert action is one activity row, so the
feed (§5.5) shows who dealt with what.

When a new Help alert arrives while the master is open, the phone vibrates
and plays a short sound, unless the viewer has turned alerts off (§6).

**Escalation:** a Help alert nobody has answered after 3 minutes turns
"Waiting 3 min", sounds again for everyone with the master open, alerts
switched off or not, and moves to the top. A handed-back task nobody has
taken 15 minutes before it starts does the same.

### 5.2 Now

What is happening right now across the run sheet, as cards. Each card shows
the item's title, its time with "ends in 12 min", its location, its step
progress ("2 of 4 steps", spec 54 §6.3), the lead first, and each
assignee's chip with their state (to do, on it, done, late +10, handed back,
help) in spec 54's state colours and words. Tapping a chip offers **Call**,
**Text** and **Open their link** (to see what they see).

A **cue** (spec 54 §6.16) shows a countdown from 5 minutes before its start
and a large **Go** button. Go marks the moment, tells its assignees' links
"Go now", and writes a `cue_go` activity row. Go can be tapped early or late;
the timeline records when it actually happened.

### 5.3 Up next

The next hour of items, the same cards, smaller. Further items are in the
timeline (§5.4).

### 5.4 Timeline and shifting

The whole day in time order, each item with its assignees' live states. A
done item collapses to a single line with a tick.

**Shift the schedule** is on every item, and on Running late alerts:

1. Choose **+5**, **+10**, **+15** or **Other**.
2. Choose what moves: **This item and everything after it today**
   (recommended) or **Just this item**.
3. A preview lists what moves ("7 items, 3:30 → 3:40 … 9:00 → 9:10"), with
   fixed times (spec 50's pinned items, like the ceremony) left where they
   are and marked "fixed".
4. **Shift** applies it through spec 50's own scheduling, as one change with
   **Undo**.

Every helper whose item moved sees spec 54's "Changed" badge on their link.

### 5.5 Feed

Every activity row from every day link and module, newest first: "1:47
Sione started Programmes at the gate", "2:14 Kiri needs help: Can't find
someone", "2:16 Mere answered: On my way", "3:02 Lens & Light took 'Aroha's
whole family'". Filters: **Problems**, **Notes**, **Progress**, and one per
module. A row with a helper's photo shows it as a
thumbnail ("3:58 Tama finished Set up the arbour" with the photo). **Photos**
is a filter too: every photo helpers sent today, as a grid.

### 5.6 Module cards

Each module of spec 54 may add a **master card**, a one-line summary that
links to its detail:

- **Shot list** (spec 52): "Family formals · 6 of 12 · 2 missed".
- **Seating** (spec 53 Part I): "86 of 112 arrived".

A module declares its master card in spec 54's registry, beside its tabs.

### 5.7 People

Everyone with a day link: whether they've opened it, whether they've tapped
I'm here and when (spec 54 §6.12), what they're on now, and their state. Each
has **Call** and **Text**. Before the day, anyone who hasn't opened their
link is listed first. On the day, anyone with a task in the next 30 minutes
who hasn't tapped I'm here is listed first, in amber.

### 5.8 Announcements

**Announce** sits at the top of the master. It asks for:

1. **Who:** everyone with a link, a group (spec 54 §10.2), or one person.
2. **What:** a line or two ("Ceremony running 10 minutes late").
3. **Important:** on or off. Important ones stay pinned on helpers' links
   until they tap OK, got it.

Sent announcements list under Announce with "Seen by 7 of 10" and, for
important ones, "OK from 5 of 10", each count opening the names. A shift of
the schedule (§5.4) offers to announce it ("Shifted 6 items by 10 minutes"),
pre-filled, to everyone whose tasks moved.

## 6. Alerts per viewer

- Each collaborator and planner has **Alerts on the day: on/off** in their
  own settings. With it off, the master shows everything but never vibrates
  or plays a sound for them.
- The couple can make one person the **day lead** (the planner or a person
  from `people`). The day lead's name shows on every Help alert ("Mere will
  answer"), and the couple's own alerts turn off by default. Anyone can
  still answer.

## 7. Before and after the day

- **Before the day** `/day` is a **readiness** check, not the live screen:
  - items with nobody assigned;
  - assignees without a day link;
  - links made but never opened;
  - tasks not yet confirmed (spec 54 §6.11), with "Confirmed 8 of 10";
  - tasks handed back before the day, with Reassign;
  - open tasks with places still free (spec 54 §10.2);
  - questions from helpers, with Answer (spec 54 §10.8);
  - helpers with no phone number (they can't be called on the day);
  - day contacts or Good to know not set (spec 54 §10.6, §10.9).

  Each line links to where it's fixed.
- **On the day** (from midnight before the first event, in the wedding's
  timezone) it is the live screen.
- **After the day** it becomes a **summary**: every item with who did it and
  when, everything handed back or never done, every help request and its
  answer, every note and photo, every announcement with who saw it, when
  each cue was actually called, and the modules' summaries. **Download**
  gives the summary as CSV.

## 8. Live

The master polls every 10 seconds while open, and on coming back to the tab.
Its own writes (answers, reassigning, shifting) go through spec 54's offline
queue. A strip says "Updated 5 s ago", and turns amber with "Offline —
showing 2:14" when it can't refresh.

## 9. Data

Mostly reads of spec 54's tables. Migration `0053_day_master.sql` (after
specs 51, 54, 52 and 53):

- `collaborators.day_alerts boolean not null default true`, and the same on
  `people` for planner logins.
- `weddings.day_lead_person_id uuid null` (a composite foreign key to
  `people`) and `weddings.day_lead_user_id uuid null` (a composite foreign key
  to `collaborators`), with a check that at most one is set.
- Master actions write `day_activity` rows (spec 54 §11) with the
  collaborator or planner as actor: `help_answered`, `reassigned`,
  `marked_started`, `alert_dismissed`, `schedule_shifted`, `cue_go`,
  `announced`, `question_answered`.
- Announcements themselves are spec 54's `day_announcements` (spec 54 §11).

## 10. Code

- `src/lib/day-master/alerts.ts`: which alerts are open, from assignee states
  and activity rows, including the 5-minute "not started" rule. Pure and
  tested.
- `src/lib/day-master/shift.ts`: the preview of a shift (what moves, what's
  fixed), on top of spec 50's scheduling. Pure and tested.
- `src/lib/day-master/summary.ts`: the after-the-day summary.
- `src/server/actions/day-master.ts`: `answerHelp`, `reassignTask`,
  `markStarted`, `dismissAlert`, `shiftSchedule`, `callCue`, `announce`,
  `answerQuestion`, `setDayLead`, `setDayAlerts`. Each checks the Supabase `error`.
- `src/server/queries/day-master.ts`, wrapped in `cache()`.
- Screens: `/day` in its three modes (readiness, live, summary). The live
  mode reuses spec 54's `src/components/day-link/` cards and states.

## 11. Answered — 2026-11-24

Every question took its recommendation.

1. **Sound and vibration:** for everyone with the master open, each able to
   turn it off for themselves (§6), except escalations (§5.1). Rejected: the
   day lead only.
2. **Shifting the schedule:** the couple and the planner (§5.4). Rejected:
   the planner only.
3. **"Not started":** 5 minutes after the start, or at the start for a
   critical task (§5.1).
4. **Day lead:** yes (§6).
5. **Phone tab bar:** on the wedding day only, Live replaces Today.

## 12. Build order

1. Spec 54 first: the master shows what day links write.
2. Migration `0053`; SQL suite assertions for the new columns and the day
   lead check.
3. `src/lib/day-master/*` and tests.
4. `/day` live: alerts, Now, Up next, feed, with polling.
5. Answering, reassigning, marking started, dismissing.
6. Timeline and shifting, with its preview and Undo.
7. Module cards, People, alerts per viewer, day lead, escalation.
7a. Announcements with seen and OK counts; Go on cues.
8. Readiness before the day, summary and CSV after.
9. Typecheck, tests, SQL suite, build. On two real phones at once: a helper
   asks for help on their link, and the master vibrates, answers, and the
   helper sees the answer.

## Build status (session 61)

**Built:** migration `0054` (spec called it `0053`); `src/lib/day-master/` (`alerts`, `shift`, `summary`, `readiness`) with tests; `src/server/queries/day-master.ts`; `src/server/actions/day-master.ts`; `/day` in its three modes; "On the day" in the sidebar (and for planner logins); Live replacing Today on the phone tab bar on the wedding day.

- **Alerts (§5.1):** Help (quick answers or text, Call, I'll take it, Dismiss), Handed back (Reassign, I'll do it), Not started (5 minutes after the start, at the start and red for a critical task; Call, Mark started, Dismiss), Running late (Shift the schedule, OK). A helper's photo shows as a thumbnail. Escalation after 3 minutes (help) or 15 minutes before the start (hand-back) moves the alert to the top, shows "Waiting N min" and sounds even with alerts off.
- **Now / Up next / Timeline / Feed / People / Announcements:** each assignee's chip in spec 54's state words with Call and Text, step progress, the lead first, cues with Standby and a large Go, module cards (shot list and seating summaries), People with who hasn't tapped I'm here, announcements with seen and OK counts that open to names, feed filters (Problems, Notes, Progress, Photos, Shots, Seating).
- **Shifting (§5.4):** +5 / +10 / +15 / Other, "this item and everything after it" or "just this item", a preview that lists what moves and what stays fixed, applied through spec 50's `shift_run_sheet_item`, with Undo and an offer to announce it.
- **Readiness before the day, summary and CSV after (§7);** announce, answer questions, day lead and alerts on/off (§6).
- **Live (§8):** refreshes every 10 seconds and on returning to the tab, "Updated N s ago", amber "Offline — showing 2:14".

**Verified:** typecheck, unit tests, SQL suite, build; the Live screen rendered once in headless Chromium at desktop width with sample data. **Not verified:** the readiness and summary modes in a browser, a phone, sound and vibration, two phones at once (the spec's own acceptance check), live Supabase.

**Different from the spec:** the master's own writes don't go through spec 54's offline queue (they show an error and don't queue); "Just this item" is allowed only when nothing starts after it (spec 50 moves followers with their predecessor); "Shift" doesn't yet offer a per-viewer announce to just those whose tasks moved (it pre-fills an announcement to everyone); there is no per-collaborator default-off beyond `setDayLead` turning the couple's alerts off.
