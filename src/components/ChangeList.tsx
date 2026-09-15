"use client";

import { changeRatio, wordDiff } from "@/lib/diff";
import type { Change } from "@/lib/schema";

const KIND_LABEL: Record<Change["kind"], string> = {
  edit: "Rewritten",
  add: "Added",
  remove: "Removed",
};

function Diff({ before, after }: { before: string; after: string }) {
  if (!before) return <p className="text-[12.5px] leading-relaxed">{after}</p>;
  if (!after) return <p className="text-[12.5px] leading-relaxed line-through opacity-60">{before}</p>;

  const parts = wordDiff(before, after);

  // A near-total rewrite interleaves into noise — show the two versions instead.
  if (changeRatio(parts) > 0.6) {
    return (
      <span className="block space-y-1.5 text-[12.5px] leading-relaxed">
        <span className="block rounded-sm bg-warn-soft px-2 py-1 text-warn line-through decoration-1">{before}</span>
        <span className="block rounded-sm bg-good-soft px-2 py-1 text-good">{after}</span>
      </span>
    );
  }

  return (
    <p className="text-[12.5px] leading-relaxed">
      {parts.map((part, index) =>
        part.type === "same" ? (
          <span key={index}>{part.value}</span>
        ) : part.type === "added" ? (
          <span key={index} className="rounded-sm bg-good-soft text-good">
            {part.value}
          </span>
        ) : (
          <span key={index} className="rounded-sm bg-warn-soft text-warn line-through decoration-1">
            {part.value}
          </span>
        ),
      )}
    </p>
  );
}

export function ChangeList({
  changes,
  rejected,
  onToggle,
  onSetAll,
}: {
  changes: Change[];
  rejected: Set<string>;
  onToggle: (id: string) => void;
  onSetAll: (accept: boolean) => void;
}) {
  if (changes.length === 0) {
    return <p className="text-sm text-muted">The model left the resume as it was.</p>;
  }

  const acceptedCount = changes.length - changes.filter((change) => rejected.has(change.id)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {acceptedCount} of {changes.length} applied
        </span>
        <span className="flex gap-2">
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => onSetAll(true)}>
            Accept all
          </button>
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => onSetAll(false)}>
            Reject all
          </button>
        </span>
      </div>

      {changes.map((change) => {
        const accepted = !rejected.has(change.id);
        return (
          <div
            key={change.id}
            className={`rounded-lg border p-3 transition-opacity ${
              accepted ? "border-line bg-surface" : "border-line bg-surface-2 opacity-60"
            }`}
          >
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={accepted}
                onChange={() => onToggle(change.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium tracking-wide text-accent uppercase">
                    {KIND_LABEL[change.kind]}
                  </span>
                  <span className="truncate text-xs font-medium text-muted">{change.label}</span>
                </span>
                <span className="mt-2 block">
                  <Diff before={change.before} after={change.after} />
                </span>
                <span className="mt-2 block text-[11.5px] text-muted italic">{change.rationale}</span>
              </span>
            </label>
          </div>
        );
      })}
    </div>
  );
}
