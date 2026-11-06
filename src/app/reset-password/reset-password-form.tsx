"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { PASSWORD_MIN, passwordProblem } from "@/lib/onboarding";

type State = { status: "idle" | "saving" | "error"; message?: string };

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  async function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    const problem = passwordProblem(password);
    if (problem) {
      setState({ status: "error", message: `${problem}.` });
      return;
    }

    if (password !== confirm) {
      setState({ status: "error", message: "Passwords don't match." });
      return;
    }

    setState({ status: "saving" });

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setState({ status: "error", message: error.message });
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">New password</span>
        <input
          type="password"
          required
          minLength={PASSWORD_MIN}
          autoFocus
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Confirm password</span>
        <input
          type="password"
          required
          minLength={PASSWORD_MIN}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="field"
        />
      </label>

      {state.status === "error" ? (
        <p className="text-sm text-red-700">{state.message}</p>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={state.status === "saving"}>
        {state.status === "saving" ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
