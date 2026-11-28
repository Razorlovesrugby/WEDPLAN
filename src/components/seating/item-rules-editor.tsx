"use client";

import { newItemId, RULE_KINDS, RULE_LABEL, rulePositions, TABLE_ITEM_KINDS, TABLE_ITEM_LABEL, type ItemRule, type RuleKind, type RuleTable, type TableItemKind } from "@/lib/seating/table-items";

export type RuleChoices = { dishes: { id: string; name: string }[]; customItems: { id: string; name: string }[] };

/** The "what" of a rule as one select value: a kind, or a dish or custom item by id. */
const whatValue = (r: Pick<ItemRule, "kind" | "ref">) => (r.kind === "dish" || r.kind === "custom" ? `${r.kind}:${r.ref ?? ""}` : r.kind);

/**
 * Items placed by rule (spec 59 D.2): "a platter every 3 seats", "flowers at each end". On a table style, so it applies to
 * every table with that style and follows each table's size and chair count; on one table, as its own change over the style.
 * `table`, when given, says how many places each rule makes and how many guests each serves.
 */
export function ItemRulesEditor({
  rules,
  onChange,
  choices,
  readOnly = false,
  table,
}: {
  rules: ItemRule[];
  onChange: (rules: ItemRule[]) => void;
  choices: RuleChoices;
  readOnly?: boolean;
  table?: RuleTable;
}) {
  const set = (id: string, patch: Partial<ItemRule>) => onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const pickWhat = (id: string, value: string) => {
    const [kind, ref] = value.split(":") as [TableItemKind, string | undefined];
    const patch: Partial<ItemRule> = { kind, ref: ref || undefined };
    if (kind !== "dish" && kind !== "custom") patch.ref = undefined;
    set(id, patch);
  };
  const add = () => onChange([...rules, { id: newItemId(new Set(rules.map((r) => r.id))), kind: "arrangement", rule: "centre" }]);
  const field = "field py-1 text-sm";
  return (
    <div className="space-y-2">
      {rules.length === 0 ? <p className="text-xs text-muted">No items are placed by rule.</p> : null}
      {rules.map((r) => {
        const here = table ? rulePositions(table, r) : null;
        const serves = here && here.length > 0 && here[0]!.serves !== undefined ? here.map((p) => p.serves) : null;
        return (
          <div key={r.id} className="flex flex-wrap items-end gap-1.5 rounded border border-line bg-paper px-2 py-1.5">
            <label className="text-xs text-muted">
              Place
              <select className={`${field} block`} disabled={readOnly} value={whatValue(r)} onChange={(e) => pickWhat(r.id, e.target.value)} aria-label="What to place">
                {TABLE_ITEM_KINDS.filter((k) => k !== "dish" && k !== "custom").map((k) => (
                  <option key={k} value={k}>
                    {TABLE_ITEM_LABEL[k]}
                  </option>
                ))}
                {choices.dishes.length > 0 ? (
                  <optgroup label="Dishes">
                    {choices.dishes.map((d) => (
                      <option key={d.id} value={`dish:${d.id}`}>
                        {d.name || "Dish"}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {choices.customItems.length > 0 ? (
                  <optgroup label="Your own items">
                    {choices.customItems.map((c) => (
                      <option key={c.id} value={`custom:${c.id}`}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
            <label className="text-xs text-muted">
              Rule
              <select className={`${field} block`} disabled={readOnly} value={r.rule} onChange={(e) => set(r.id, { rule: e.target.value as RuleKind, n: e.target.value === "every_n_seats" || e.target.value === "n_per_table" ? (r.n ?? 3) : undefined, end: e.target.value === "one_end" ? (r.end ?? "head") : undefined })} aria-label="Rule">
                {RULE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {RULE_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            {r.rule === "every_n_seats" || r.rule === "n_per_table" ? (
              <label className="text-xs text-muted">
                N
                <input className={`${field} block w-14`} type="number" min={1} max={60} disabled={readOnly} value={r.n ?? 3} onChange={(e) => set(r.id, { n: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} aria-label="N" />
              </label>
            ) : null}
            {r.rule === "one_end" ? (
              <label className="text-xs text-muted">
                Which end
                <select className={`${field} block`} disabled={readOnly} value={r.end ?? "head"} onChange={(e) => set(r.id, { end: e.target.value as "head" | "foot" })} aria-label="Which end">
                  <option value="head">Head (right)</option>
                  <option value="foot">Foot (left)</option>
                </select>
              </label>
            ) : null}
            {here ? (
              <span className="text-xs text-muted" aria-live="polite">
                {here.length} {here.length === 1 ? "place" : "places"}
                {serves ? ` · serves ${[...new Set(serves)].join(" or ")} each` : ""}
              </span>
            ) : null}
            {readOnly ? null : (
              <button type="button" className="ml-auto text-xs underline" onClick={() => onChange(rules.filter((x) => x.id !== r.id))}>
                Remove
              </button>
            )}
          </div>
        );
      })}
      {readOnly ? null : (
        <button type="button" className="btn py-1" onClick={add} disabled={rules.length >= 40}>
          Add a rule
        </button>
      )}
    </div>
  );
}
