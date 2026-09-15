import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/server/queries/wedding";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set password" };

export default async function ResetPasswordPage() {
  const user = await getSessionUser();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-serif text-3xl">Set password</h1>

      {user ? (
        <>
          <p className="mt-2 text-sm text-muted">Choose a new password for {user.email}.</p>
          <ResetPasswordForm />
        </>
      ) : (
        <p className="mt-6 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          That reset link is no longer valid.{" "}
          <Link href="/forgot-password" className="underline">
            Request a new one
          </Link>
          .
        </p>
      )}
    </main>
  );
}
