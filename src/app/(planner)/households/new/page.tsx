import Link from "next/link";
import { HouseholdForm } from "@/components/guests/household-form";

export const metadata = { title: "New household" };

export default function NewHouseholdPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <nav className="text-sm text-muted">
        <Link href="/guests" className="hover:underline">
          Guests
        </Link>
      </nav>
      <h1 className="font-serif text-2xl">Add a household</h1>
      <p className="text-sm text-muted">
        Households are the invite unit; the people inside are the headcount. Create the household
        first, then add whoever lives there.
      </p>
      <HouseholdForm />
    </div>
  );
}
