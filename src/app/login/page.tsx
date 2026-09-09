"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Login() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Could not sign in.");
      }
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-line bg-surface p-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Resume <span className="text-accent">Tailor</span>
        </h1>
        <p className="mt-1 text-sm text-muted">This one&apos;s private. Enter the password to continue.</p>

        <label htmlFor="password" className="mt-5 block text-xs font-medium tracking-wide text-muted uppercase">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />

        {error ? <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">{error}</p> : null}

        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="mt-4 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:text-[#0d1117]"
        >
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
