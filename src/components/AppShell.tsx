import { Suspense } from "react";
import { Sidebar } from "./Sidebar";

/** Sidebar beside the page on wide screens, stacked under a bar on narrow ones. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Suspense because the sidebar reads the query string, which a
          prerendered page cannot know. */}
      <Suspense fallback={<div className="hidden w-60 shrink-0 border-r border-line bg-surface lg:block" />}>
        <Sidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
