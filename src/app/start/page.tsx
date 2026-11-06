import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { onboardingOpen } from "@/lib/env";
import { currencyOptions } from "@/lib/onboarding";
import { getCurrentWedding, getSessionUser } from "@/server/queries/wedding";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "Set up your wedding" };

/**
 * Self-serve onboarding (spec 40 §5.2). Public; scopes itself: a signed-in
 * person with a wedding is sent to it, and one without (an orphaned login)
 * finishes here without the account fields.
 */
export default async function StartPage() {
  const user = await getSessionUser();
  if (user && (await getCurrentWedding())) redirect("/");

  if (!onboardingOpen()) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
        <h1 className="font-serif text-3xl">Not taking new weddings right now</h1>
        <p className="mt-3 text-sm text-muted">
          WedPlan isn&rsquo;t open for sign-ups at the moment. Please check back soon.
        </p>
        <p className="mt-8 text-sm">
          Already have a login?{" "}
          <Link className="underline hover:text-accent" href="/login">
            Sign in
          </Link>
        </p>
      </main>
    );
  }

  const timeZones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="font-serif text-3xl">Set up your wedding</h1>
      <p className="mt-2 text-sm text-muted">
        A few details and you&rsquo;re in. You can change all of this later in Settings.
      </p>
      <StartForm signedInEmail={user?.email ?? null} timeZones={timeZones} currencies={currencyOptions()} />
      {user ? null : (
        <p className="mt-10 text-sm text-muted">
          Already have a login?{" "}
          <Link className="underline hover:text-accent" href="/login">
            Sign in
          </Link>
        </p>
      )}
    </main>
  );
}
