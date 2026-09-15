"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { describeAge } from "@/lib/storage";

type RunSummary = {
  id: string;
  company: string;
  jobTitle: string;
  matchScore: number;
  pinned: boolean;
  createdAt: string;
};

const RANGES = [
  { label: "All time", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
];

export function History() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [query, setQuery] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [days, setDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (pinnedOnly) params.set("pinned", "true");
      if (days) params.set("days", String(days));

      const response = await fetch(`/api/runs?${params}`);
      const data = (await response.json()) as { runs?: RunSummary[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load your history.");
      setRuns(data.runs ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your history.");
    } finally {
      setLoading(false);
    }
  }, [query, pinnedOnly, days]);

  // Debounced, so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function togglePin(run: RunSummary) {
    setRuns((previous) => previous.map((r) => (r.id === run.id ? { ...r, pinned: !r.pinned } : r)));
    await fetch(`/api/runs/${run.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !run.pinned }),
    }).catch(() => {});
    load();
  }

  async function remove(run: RunSummary) {
    if (!confirm(`Delete the ${run.company || "untitled"} application? This cannot be undone.`)) return;
    setRuns((previous) => previous.filter((r) => r.id !== run.id));
    await fetch(`/api/runs/${run.id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="mt-1 text-sm text-muted">Every resume you have tailored, newest first. Pinned ones stay on top.</p>
        </div>
        <Link href="/" className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2">
          Tailor another
        </Link>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by company or job title…"
          className="min-w-56 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {RANGES.map((range) => (
            <option key={range.days} value={range.days}>
              {range.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setPinnedOnly((previous) => !previous)}
          className={`rounded-md border px-3 py-2 text-sm ${
            pinnedOnly ? "border-transparent bg-accent text-white dark:text-[#0d1117]" : "border-line hover:bg-surface-2"
          }`}
        >
          Pinned only
        </button>
      </div>

      {error ? <p className="rounded-md bg-warn-soft px-4 py-3 text-sm text-warn">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          {query || pinnedOnly || days ? "Nothing matches that." : "No applications yet. Tailor one and it will appear here."}
        </p>
      ) : (
        <ul className="space-y-2">
          {runs.map((run) => (
            <li key={run.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3">
              <button
                type="button"
                onClick={() => togglePin(run)}
                aria-label={run.pinned ? "Unpin" : "Pin"}
                title={run.pinned ? "Unpin" : "Pin"}
                className={`text-lg leading-none ${run.pinned ? "text-accent" : "text-muted opacity-40 hover:opacity-100"}`}
              >
                {run.pinned ? "★" : "☆"}
              </button>

              <Link href={`/?run=${run.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{run.company || "Unnamed company"}</span>
                <span className="block truncate text-xs text-muted">
                  {run.jobTitle || "Untitled role"} · {describeAge(Date.parse(run.createdAt))}
                </span>
              </Link>

              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent tabular-nums">
                {run.matchScore}
              </span>
              <button
                type="button"
                onClick={() => remove(run)}
                className="text-xs text-muted underline underline-offset-2 hover:text-warn"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
