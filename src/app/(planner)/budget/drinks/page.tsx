import Link from "next/link";
import { listDrinkPlans } from "@/server/queries/drinks";
import { getEvents, requireWedding } from "@/server/queries/wedding";
import { DrinkPlanCard } from "@/components/budget/drink-plan-card";
import { NewDrinkPlanForm } from "@/components/budget/new-drink-plan-form";

export const metadata = { title: "Drinks" };

/**
 * The drink calculator (`docs/planning-spreadsheet-gaps.md` §5, Pattern C).
 *
 * It lives under /budget rather than on its own because the question it
 * answers — what do we buy — is one half of a pair whose other half (what
 * does it cost) is a budget line. The two are linked and neither writes to
 * the other; `0030_drink_plans.sql`'s header has the argument.
 */
export default async function DrinksPage() {
  const wedding = await requireWedding();
  const [plans, events] = await Promise.all([listDrinkPlans(wedding.id), getEvents(wedding.id)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl">Drinks</h1>
          <p className="text-sm text-muted">
            What to buy, worked out from the headcount the guest list already knows.{" "}
            <Link href="/budget" className="underline">
              Back to the budget
            </Link>
          </p>
        </div>
        <NewDrinkPlanForm events={events} />
      </div>

      {plans.length === 0 ? (
        <p className="text-sm text-muted">
          No drink plans yet. Add one and it will size itself from your RSVPs — the shopping list
          moves as people reply, so there is nothing to recalculate by hand.
        </p>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <DrinkPlanCard key={plan.id} plan={plan} events={events} />
          ))}
        </div>
      )}
    </div>
  );
}
