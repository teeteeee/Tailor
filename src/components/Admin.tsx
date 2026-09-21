"use client";

import { useEffect, useState } from "react";
import { describeAge } from "@/lib/storage";

type UserActivity = {
  id: string;
  email: string;
  joinedAt: string;
  total: number;
  today: number;
  lastSevenDays: number;
  lastActiveAt: string | null;
};

type ApplicationSummary = { id: string; company: string; jobTitle: string; matchScore: number; createdAt: string };
type DailyCount = { day: string; count: number };

const SORTS = [
  { value: "recent", label: "Recently active" },
  { value: "most", label: "Most applications" },
  { value: "email", label: "Email A–Z" },
] as const;

function Detail({ user, onClose }: { user: UserActivity; onClose: () => void }) {
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [daily, setDaily] = useState<DailyCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/admin/users/${user.id}`).catch(() => null);
      if (!response?.ok || cancelled) return;
      const data = (await response.json()) as { applications?: ApplicationSummary[]; daily?: DailyCount[] };
      if (cancelled) return;
      setApplications(data.applications ?? []);
      setDaily(data.daily ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const busiest = Math.max(1, ...daily.map((entry) => entry.count));

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{user.email}</h2>
        <button type="button" onClick={onClose} className="text-xs text-muted underline underline-offset-2">
          Close
        </button>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            Joined {describeAge(Date.parse(user.joinedAt))} · {user.total} application
            {user.total === 1 ? "" : "s"} in total
          </p>

          {daily.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">Applications per day</p>
              <ul className="space-y-1">
                {daily.map((entry) => (
                  <li key={entry.day} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 tabular-nums text-muted">{entry.day}</span>
                    <span
                      className="h-3 rounded-sm bg-accent"
                      style={{ width: `${Math.round((entry.count / busiest) * 100)}%`, minWidth: "0.5rem" }}
                    />
                    <span className="tabular-nums text-muted">{entry.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="mt-4 mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">Applications</p>
          {applications.length === 0 ? (
            <p className="text-sm text-muted">None yet.</p>
          ) : (
            <ul className="space-y-1">
              {applications.map((application) => (
                <li key={application.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="font-medium">{application.company || "Unnamed company"}</span>
                  <span className="text-muted">{application.jobTitle || "Untitled role"}</span>
                  <span className="ml-auto text-xs text-muted tabular-nums">
                    {application.matchScore} · {describeAge(Date.parse(application.createdAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export function Admin() {
  const [users, setUsers] = useState<UserActivity[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<string>("recent");
  const [selected, setSelected] = useState<UserActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ sort });
        if (query.trim()) params.set("q", query.trim());
        const response = await fetch(`/api/admin/users?${params}`);
        const data = (await response.json()) as { users?: UserActivity[]; error?: string };
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error ?? "Could not load users.");
        setUsers(data.users ?? []);
        setLoading(false);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load users.");
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, sort]);

  const totals = users.reduce(
    (running, user) => ({
      today: running.today + user.today,
      week: running.week + user.lastSevenDays,
      all: running.all + user.total,
    }),
    { today: 0, week: 0, all: 0 },
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted">
          How much everyone has tailored, and when. Resume contents are not shown — this is activity, not
          the documents themselves.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: "Today", value: totals.today },
          { label: "Last 7 days", value: totals.week },
          { label: "All time", value: totals.all },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-line bg-surface px-4 py-3">
            <div className="text-xl font-semibold tabular-nums">{stat.value}</div>
            <div className="text-[11px] tracking-wide text-muted uppercase">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by email…"
          className="min-w-56 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="rounded-md bg-warn-soft px-4 py-3 text-sm text-warn">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : users.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          {query ? "Nobody matches that." : "No accounts yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wide text-muted uppercase">
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Today</th>
                <th className="px-3 py-2 text-right font-medium">7 days</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Last active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => setSelected(selected?.id === user.id ? null : user)}
                  className={`cursor-pointer border-b border-line last:border-0 hover:bg-surface-2 ${
                    selected?.id === user.id ? "bg-accent-soft" : ""
                  }`}
                >
                  <td className="truncate px-4 py-2">{user.email}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{user.today}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{user.lastSevenDays}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{user.total}</td>
                  <td className="px-4 py-2 text-right text-xs text-muted">
                    {user.lastActiveAt ? describeAge(Date.parse(user.lastActiveAt)) : "never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? <Detail user={selected} onClose={() => setSelected(null)} /> : null}
    </main>
  );
}
