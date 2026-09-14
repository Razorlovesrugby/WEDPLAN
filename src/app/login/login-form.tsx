"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { absoluteUrl } from "@/lib/env";

type State = { status: "idle" | "sending" | "sent" | "error"; message?: string };

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  async function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setState({ status: "sending" });

    const supabase = createClient();
    const callback = new URL(absoluteUrl("/auth/callback"));
    if (next) callback.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: callback.toString(),
        // Sign-up is disabled; only the two invited collaborators exist.
        shouldCreateUser: false,
      },
    });

    if (error) {
      setState({ status: "error", message: error.message });
      return;
    }
    setState({ status: "sent" });
  }

  if (state.status === "sent") {
    return (
      <div className="card mt-8 p-4">
        <p className="text-sm">
          Check <strong>{email}</strong> for a sign-in link.
        </p>
        <p className="mt-2 text-xs text-muted">
          It expires in an hour. If nothing arrives, check spam — then check that this address is
          one of the two on the wedding.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Email</span>
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
          placeholder="you@example.com"
        />
      </label>

      {state.status === "error" ? (
        <p className="text-sm text-red-700">{state.message}</p>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={state.status === "sending"}>
        {state.status === "sending" ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
