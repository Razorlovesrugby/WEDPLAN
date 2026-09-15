import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-serif text-3xl">Reset password</h1>
      <p className="mt-2 text-sm text-muted">
        We&rsquo;ll email a link to set a new password.
      </p>

      <ForgotPasswordForm />

      <p className="mt-10 text-xs text-muted">
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
