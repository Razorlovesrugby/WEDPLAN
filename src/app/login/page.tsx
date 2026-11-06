import type { Metadata } from "next";
import Link from "next/link";
import { onboardingOpen } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-serif text-3xl">Wedding</h1>
      <p className="mt-2 text-sm text-muted">Sign in with your email and password.</p>

      {error ? (
        <p className="mt-6 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error === "expired"
            ? "That link has expired. Request a new one."
            : "That link could not be used. Request a new one."}
        </p>
      ) : null}

      <LoginForm next={next} />

      {onboardingOpen() ? (
        <p className="mt-6 text-sm text-muted">
          New here?{" "}
          <Link className="underline hover:text-accent" href="/start">
            Set up your wedding
          </Link>
        </p>
      ) : null}

      <p className="mt-10 text-xs text-muted">
        Guests don&rsquo;t sign in. They use the link in their invitation.
      </p>
    </main>
  );
}
