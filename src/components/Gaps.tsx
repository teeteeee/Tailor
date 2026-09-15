"use client";

import { useState } from "react";

export type GapState = { closed: boolean; note: string };

export function Gaps({
  gaps,
  state,
  busyGap,
  onClose,
}: {
  gaps: string[];
  state: Record<string, GapState>;
  busyGap: string | null;
  onClose: (gap: string, evidence: string) => Promise<void>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [evidence, setEvidence] = useState("");

  return (
    <ul className="space-y-2">
      {gaps.map((gap) => {
        const gapState = state[gap];
        const isOpen = open === gap;
        const busy = busyGap === gap;

        if (gapState?.closed) {
          return (
            <li key={gap} className="rounded-md bg-good-soft px-2.5 py-1.5 text-[12.5px] text-good">
              <span className="font-medium">Covered:</span> {gap}
            </li>
          );
        }

        return (
          <li key={gap} className="rounded-md bg-warn-soft text-warn">
            <button
              type="button"
              className="w-full px-2.5 py-1.5 text-left text-[12.5px] hover:underline"
              onClick={() => {
                setOpen(isOpen ? null : gap);
                setEvidence("");
              }}
            >
              {gap}
              <span className="ml-1 opacity-60">{isOpen ? "−" : "+"}</span>
            </button>

            {isOpen ? (
              <div className="border-t border-warn/20 px-2.5 py-2">
                <p className="text-[11.5px] leading-relaxed opacity-90">
                  Have you actually done this? Say what you did and it gets placed in the right section. If you
                  haven&apos;t, leave it — the gap is the more useful answer.
                </p>
                <textarea
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  placeholder="e.g. I built the internal gRPC services at Difference Data for two years."
                  className="mt-2 max-h-40 min-h-16 w-full resize-y rounded-md border border-line bg-surface p-2 text-[12px] text-foreground outline-none focus:border-accent"
                />
                {gapState?.note ? <p className="mt-1.5 text-[11.5px] italic">{gapState.note}</p> : null}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy || evidence.trim().length < 15}
                    onClick={async () => {
                      await onClose(gap, evidence);
                      setEvidence("");
                    }}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:text-[#0d1117]"
                  >
                    {busy ? "Placing…" : "Add to resume"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
                    className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
