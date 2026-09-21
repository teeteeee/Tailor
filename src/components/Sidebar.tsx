"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type RunSummary = {
  id: string;
  company: string;
  jobTitle: string;
  pinned: boolean;
  createdAt: string;
};

/**
 * Persistent navigation: the resume in hand, and everything tailored before it.
 *
 * The recent runs live here rather than only on /history so that moving between
 * applications is one click from wherever you are.
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [account, setAccount] = useState<{ email: string; isAdmin: boolean } | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [open, setOpen] = useState(false);

  // Read through Next's hook rather than window: the server has no location,
  // and reading one during render would not survive hydration.
  const activeRun = useSearchParams().get("run");

  // Re-read on navigation, so a newly saved run appears without a reload.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const response = await fetch("/api/account").catch(() => null);
      if (!response?.ok || cancelled) return;
      const { email, isAdmin } = (await response.json()) as { email?: string | null; isAdmin?: boolean };
      if (!email || cancelled) return;
      setAccount({ email, isAdmin: Boolean(isAdmin) });

      const list = await fetch("/api/runs").catch(() => null);
      if (!list?.ok || cancelled) return;
      const data = (await list.json()) as { runs?: RunSummary[] };
      if (!cancelled) setRuns((data.runs ?? []).slice(0, 12));
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, activeRun]);

  const navLink = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      onClick={() => setOpen(false)}
      className={`block rounded-md px-3 py-2 text-sm ${
        active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );

  const body = (
    <>
      <div className="px-3">
        <Link href="/" onClick={() => setOpen(false)} className="text-lg font-semibold tracking-tight">
          Resume <span className="text-accent">Tailor</span>
        </Link>
      </div>

      <div className="mt-5 px-3">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            router.push("/");
            router.refresh();
          }}
          className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white dark:text-[#1a0f08]"
        >
          New tailoring
        </button>
      </div>

      <nav className="mt-4 space-y-0.5 px-2">
        {navLink("/", "Current resume", pathname === "/" && !activeRun)}
        {account ? navLink("/history", "All history", pathname === "/history") : null}
        {account?.isAdmin ? navLink("/admin", "Users", pathname === "/admin") : null}
      </nav>

      {account ? (
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-2">
          <p className="px-1 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">Recent</p>
          {runs.length === 0 ? (
            <p className="px-1 text-xs text-muted">Nothing yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {runs.map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/?run=${run.id}`}
                    onClick={() => setOpen(false)}
                    className={`block truncate rounded-md px-3 py-1.5 text-[13px] ${
                      activeRun === run.id
                        ? "bg-accent-soft font-medium text-accent"
                        : "text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    {run.pinned ? "★ " : ""}
                    {run.company || "Unnamed company"}
                    <span className="block truncate text-[11px] opacity-70">{run.jobTitle || "Untitled role"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-5 flex-1" />
      )}

      {account ? (
        <div className="border-t border-line px-3 pt-3">
          <p className="truncate text-[11px] text-muted" title={account.email}>
            {account.email}
          </p>
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              setAccount(null);
              router.replace("/login");
              router.refresh();
            }}
            className="mt-1 text-xs text-muted underline underline-offset-2 hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </>
  );

  return (
    <>
      {/* Small screens: a bar with a toggle, since a fixed sidebar would eat the page. */}
      <div className="no-print flex items-center gap-3 border-b border-line bg-surface px-4 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          aria-label="Menu"
          className="rounded-md border border-line px-2.5 py-1.5 text-sm"
        >
          ☰
        </button>
        <span className="text-sm font-semibold">
          Resume <span className="text-accent">Tailor</span>
        </span>
      </div>

      {open ? (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute top-0 left-0 flex h-full w-64 flex-col border-r border-line bg-surface py-4">
            {body}
          </aside>
        </div>
      ) : null}

      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface py-4 lg:flex">
        {body}
      </aside>
    </>
  );
}
