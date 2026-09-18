"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePayment, markPaymentPaid, recordPayment } from "@/server/actions/budget";
import { formatDate, formatMoney } from "@/lib/format";
import type { PaymentRow } from "@/lib/types/database";

/** A line item's payment schedule — spec 6, section 2. Overdue (unpaid, past due) is highlighted the way /timeline highlights overdue items. */
export function PaymentList({
  budgetItemId,
  payments,
  timezone,
}: {
  budgetItemId: string;
  payments: PaymentRow[];
  timezone: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function onMarkPaid(id: string, alreadyPaid: boolean) {
    startTransition(async () => {
      const result = await markPaymentPaid(id, alreadyPaid ? null : new Date().toISOString());
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function onDelete(id: string) {
    if (!confirm("Delete this payment?")) return;
    startTransition(async () => {
      const result = await deletePayment(id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded border border-line/70 bg-paper/50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Payments</p>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {payments.length === 0 ? (
        <p className="text-sm text-muted">No payments recorded yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {payments.map((p) => {
            const overdue = !p.paid_at && p.due_date !== null && p.due_date < today;
            return (
              <li
                key={p.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1 ${overdue ? "bg-red-50" : ""}`}
              >
                <span>
                  {formatMoney(p.amount)}
                  {p.due_date ? (
                    <span className={`ml-2 text-xs ${overdue ? "text-red-700" : "text-muted"}`}>
                      due {formatDate(p.due_date, timezone)}
                    </span>
                  ) : null}
                  {p.paid_at ? (
                    <span className="ml-2 text-xs text-tierA">paid {formatDate(p.paid_at, timezone)}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    disabled={pending}
                    className="text-accent hover:underline"
                    onClick={() => onMarkPaid(p.id, !!p.paid_at)}
                  >
                    {p.paid_at ? "Mark unpaid" : "Mark paid"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className="text-red-700 hover:underline"
                    onClick={() => onDelete(p.id)}
                  >
                    Delete
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <AddPaymentForm budgetItemId={budgetItemId} onDone={() => setAdding(false)} onError={setError} />
      ) : (
        <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setAdding(true)}>
          + Record a payment
        </button>
      )}
    </div>
  );
}

function AddPaymentForm({
  budgetItemId,
  onDone,
  onError,
}: {
  budgetItemId: string;
  onDone: () => void;
  onError: (error: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");

  function submit() {
    startTransition(async () => {
      const result = await recordPayment(budgetItemId, {
        amount: Math.round(Number(amount || "0") * 100),
        due_date: dueDate,
        reference,
      });
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onError(null);
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-line bg-white p-2">
      <label className="text-xs text-muted">
        Amount
        <input value={amount} onChange={(e) => setAmount(e.target.value)} className="field mt-0.5 block w-24 text-sm" />
      </label>
      <label className="text-xs text-muted">
        Due date
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="field mt-0.5 block text-sm" />
      </label>
      <label className="text-xs text-muted">
        Reference
        <input value={reference} onChange={(e) => setReference(e.target.value)} className="field mt-0.5 block w-32 text-sm" />
      </label>
      <button type="button" disabled={pending} className="btn-primary px-2 py-1 text-xs" onClick={submit}>
        Save
      </button>
      <button type="button" className="btn px-2 py-1 text-xs" onClick={onDone}>
        Cancel
      </button>
    </div>
  );
}
