"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signingUp = mode === "signup";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(signingUp ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        throw new Error(((await response.json()) as { error?: string }).error ?? "That didn't work.");
      }
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work.");
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-line bg-surface p-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Resume <span className="text-accent">Tailor</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          {signingUp ? "Create an account to keep your history." : "Sign in to your history."}
        </p>

        <label htmlFor="email" className="mt-5 block text-xs font-medium tracking-wide text-muted uppercase">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1.5 w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <label htmlFor="password" className="mt-4 block text-xs font-medium tracking-wide text-muted uppercase">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete={signingUp ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {signingUp ? <p className="mt-1.5 text-xs text-muted">At least 10 characters.</p> : null}

        {error ? <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">{error}</p> : null}

        <button
          type="submit"
          disabled={busy || !email || !password}
          className="mt-4 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:text-[#0d1117]"
        >
          {busy ? "One moment…" : signingUp ? "Create account" : "Sign in"}
        </button>

        <p className="mt-4 text-center text-xs text-muted">
          {signingUp ? "Already have an account? " : "No account yet? "}
          <Link href={signingUp ? "/login" : "/signup"} className="text-accent underline underline-offset-2">
            {signingUp ? "Sign in" : "Create one"}
          </Link>
        </p>
      </form>
    </main>
  );
}
