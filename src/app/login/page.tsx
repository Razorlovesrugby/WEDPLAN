import type { Metadata } from "next";
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
      <p className="mt-2 text-sm text-muted">
        Sign in with your email. We&rsquo;ll send a link — there is no password to forget.
      </p>

      {error ? (
        <p className="mt-6 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error === "expired"
            ? "That link has expired. Request a new one below."
            : "That link could not be used. Request a new one below."}
        </p>
      ) : null}

      <LoginForm next={next} />

      <p className="mt-10 text-xs text-muted">
        Guests don&rsquo;t sign in. They use the link in their invitation.
      </p>
    </main>
  );
}
