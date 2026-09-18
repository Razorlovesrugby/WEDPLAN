import {
  getBudgetSummary,
  getUpcomingPayments,
  getGuestCounts,
  listBudgetCategories,
  listBudgetItems,
  listConsumptionComponents,
} from "@/server/queries/budget";
import { getBudgetItemLinksForItems, noBudgetItemLinks } from "@/server/queries/budget-links";
import { getFxRate } from "@/server/queries/fx";
import { getAllItems, getAllSections, getLists } from "@/server/queries/lists";
import { getEvents, requireWedding } from "@/server/queries/wedding";
import { CategoryHeader } from "@/components/budget/category-header";
import { NewCategoryForm } from "@/components/budget/new-category-form";
import { AddBudgetItemForm } from "@/components/budget/add-budget-item-form";
import { BudgetItemRow } from "@/components/budget/budget-item-row";
import { PaymentCalendar } from "@/components/budget/payment-calendar";
import { formatMoney, pluralise } from "@/lib/format";

export const metadata = { title: "Budget" };

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { item: openItemId } = await searchParams;
  const wedding = await requireWedding();
  const [categories, items, components, payments, summary, events, lists, sections, allTasks] = await Promise.all([
    listBudgetCategories(wedding.id),
    listBudgetItems(wedding.id),
    listConsumptionComponents(wedding.id),
    getUpcomingPayments(wedding.id),
    getBudgetSummary(wedding.id),
    getEvents(wedding.id),
    getLists(wedding.id),
    getAllSections(wedding.id),
    getAllItems(wedding.id),
  ]);

  // Guest counts, one lookup per distinct event scope actually used by an
  // item (plus the whole-wedding "no event" scope) — not one per item.
  const eventIds = [...new Set(items.map((i) => i.event_id).filter((id): id is string => id !== null))];

  // FX state, one lookup per distinct foreign currency in use — cached in
  // fx_rates, so this is at most one external call per currency per day
  // across the whole app, not per item and not per page load.
  const foreignCurrencies = [...new Set(items.filter((i) => i.currency !== wedding.base_currency).map((i) => i.currency))];

  // All three need `items` first, but none of them needs either of the other
  // two — so they go out as one concurrent batch. They used to be three
  // separate `await`s, which made the page wait for counts, then rates, then
  // links, end to end, on top of the `Promise.all` above.
  const [countsEntries, fxEntries, linksByItem] = await Promise.all([
    Promise.all(
      [null, ...eventIds].map(async (eventId) => [eventId, await getGuestCounts(wedding.id, eventId)] as const),
    ),
    Promise.all(
      foreignCurrencies.map(
        async (currency) => [currency, await getFxRate(currency, wedding.id, wedding.base_currency)] as const,
      ),
    ),
    getBudgetItemLinksForItems(
      wedding.id,
      items.map((i) => i.id),
    ),
  ]);
  const countsByScope = new Map(countsEntries);
  const fxByCurrency = new Map(fxEntries);

  const componentsByItem = new Map<string, typeof components>();
  for (const c of components) {
    const list = componentsByItem.get(c.budget_item_id) ?? [];
    list.push(c);
    componentsByItem.set(c.budget_item_id, list);
  }
  const paymentsByItem = new Map<string, typeof payments>();
  for (const p of payments) {
    const list = paymentsByItem.get(p.budget_item_id) ?? [];
    list.push(p);
    paymentsByItem.set(p.budget_item_id, list);
  }
  const itemsByCategory = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByCategory.get(item.category_id) ?? [];
    list.push(item);
    itemsByCategory.set(item.category_id, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl">Budget</h1>
        <NewCategoryForm />
      </div>

      {summary ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryFigure label="Estimated" value={formatMoney(summary.total_estimated, wedding.base_currency)} />
          <SummaryFigure label="Quoted" value={formatMoney(summary.total_quoted, wedding.base_currency)} />
          <SummaryFigure label="Contracted" value={formatMoney(summary.total_contracted, wedding.base_currency)} />
          <SummaryFigure label="Paid" value={formatMoney(summary.total_paid, wedding.base_currency)} tone="good" />
          <SummaryFigure
            label="Outstanding"
            value={formatMoney(summary.total_outstanding, wedding.base_currency)}
            tone={summary.total_outstanding > 0 ? "warn" : "good"}
          />
        </section>
      ) : null}

      {summary && (summary.per_head_adult !== null || summary.per_head_seat !== null) ? (
        <p className="text-sm text-muted">
          Per head, from every per-unit and consumption line:{" "}
          {summary.per_head_adult !== null ? (
            <strong>{formatMoney(summary.per_head_adult, wedding.base_currency)}/adult</strong>
          ) : null}
          {summary.per_head_adult !== null && summary.per_head_seat !== null ? " · " : null}
          {summary.per_head_seat !== null ? (
            <strong>{formatMoney(summary.per_head_seat, wedding.base_currency)}/seat</strong>
          ) : null}
        </p>
      ) : null}

      {categories.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">No categories yet — add the first one above.</p>
      ) : (
        <div className="space-y-6">
          {categories.map((category) => {
            const categoryItems = itemsByCategory.get(category.id) ?? [];
            return (
              <section key={category.id} className="card p-4">
                <CategoryHeader category={category} />
                {categoryItems.length === 0 ? (
                  <p className="py-2 text-sm text-muted">No items yet.</p>
                ) : (
                  <div>
                    {categoryItems.map((item) => (
                      <BudgetItemRow
                        key={item.id}
                        item={item}
                        baseCurrency={wedding.base_currency}
                        events={events}
                        components={componentsByItem.get(item.id) ?? []}
                        payments={paymentsByItem.get(item.id) ?? []}
                        lists={lists}
                        sections={sections}
                        allTasks={allTasks}
                        links={linksByItem.get(item.id) ?? noBudgetItemLinks()}
                        timezone={wedding.timezone}
                        counts={countsByScope.get(item.event_id) ?? { adult: 0, child: 0, seat: 0 }}
                        fxState={item.currency !== wedding.base_currency ? (fxByCurrency.get(item.currency) ?? null) : null}
                        autoOpenLinks={item.id === openItemId}
                      />
                    ))}
                  </div>
                )}
                <div className="mt-3">
                  <AddBudgetItemForm categoryId={category.id} events={events} />
                </div>
              </section>
            );
          })}
        </div>
      )}

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
          Payments · {pluralise(payments.filter((p) => !p.paid_at && p.due_date).length, "upcoming")}
        </h2>
        <PaymentCalendar payments={payments} timezone={wedding.timezone} />
      </section>
    </div>
  );
}

function SummaryFigure({ label, value, tone }: { label: string; value: string; tone?: "warn" | "good" }) {
  const toneClass = tone === "warn" ? "text-tierB" : tone === "good" ? "text-tierA" : "text-ink";
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 font-serif text-2xl tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
