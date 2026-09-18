import { formatDate, formatMoney } from "@/lib/format";
import type { UpcomingPayment } from "@/server/queries/budget";

/**
 * The payment calendar from spec 6, section 4 — chronological, overdue
 * highlighted the same way /timeline highlights an overdue item. A
 * chronological list rather than a month grid: /calendar (spec 3) already
 * owns the month-grid view of everything dated across the app (it will pick
 * these up too, via v_reminders_due feeding the dashboard/digest — see
 * section 6), so this stays a focused schedule of money rather than
 * duplicating that screen.
 */
export function PaymentCalendar({ payments, timezone }: { payments: UpcomingPayment[]; timezone: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const dated = payments
    .filter((p) => p.due_date !== null)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));

  if (dated.length === 0) {
    return <p className="text-sm text-muted">No payments with a due date yet.</p>;
  }

  return (
    <ul className="divide-y divide-line/60">
      {dated.map((p) => {
        const overdue = !p.paid_at && p.due_date! < today;
        return (
          <li
            key={p.id}
            className={`flex flex-wrap items-center justify-between gap-2 px-2 py-2 text-sm ${overdue ? "bg-red-50" : ""}`}
          >
            <span>
              <span className={overdue ? "font-medium text-red-800" : ""}>{formatDate(p.due_date, timezone)}</span>{" "}
              — {p.item_vendor_name || p.item_label}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{formatMoney(p.amount)}</span>
              {p.paid_at ? (
                <span className="text-xs text-tierA">paid</span>
              ) : overdue ? (
                <span className="text-xs text-red-700">overdue</span>
              ) : (
                <span className="text-xs text-muted">due</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
