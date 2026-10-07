"use client";

import { useEffect, useRef, useState } from "react";

export type RefineTurn = { role: "user" | "assistant"; text: string };

const EXAMPLES = [
  "Drop the last bullet from my most recent role",
  "Move the automation line to the top",
  "Add that I mentored two new analysts",
];

export function Refine({
  turns,
  busy,
  onSend,
}: {
  turns: RefineTurn[];
  busy: boolean;
  onSend: (instruction: string) => Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const endOfThread = useRef<HTMLDivElement>(null);

  // Scrolling the thread is an external-system update, which is what an effect
  // is for: a new turn should bring itself into view.
  useEffect(() => {
    if (turns.length) endOfThread.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, busy]);

  const send = async () => {
    const text = instruction.trim();
    if (!text || busy) return;
    setInstruction("");
    await onSend(text);
  };

  return (
    <section className="no-print rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Change something</h2>
      <p className="mt-1 text-xs text-muted">
        Tell it what to change in plain words. Every edit lands in the change list above, so you can
        still undo it one by one.
      </p>

      {turns.length > 0 ? (
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
          {turns.map((turn, index) => (
            <p
              key={`${index}-${turn.text.slice(0, 24)}`}
              className={
                turn.role === "user"
                  ? "ml-6 rounded-lg rounded-br-sm bg-accent-soft px-3 py-2 text-[12.5px] text-foreground"
                  : "mr-6 rounded-lg rounded-bl-sm bg-surface-2 px-3 py-2 text-[12.5px] text-muted"
              }
            >
              {turn.text}
            </p>
          ))}
          {busy ? <p className="mr-6 px-3 py-2 text-[12.5px] text-muted italic">Reworking…</p> : null}
          <div ref={endOfThread} />
        </div>
      ) : (
        <ul className="mt-3 space-y-1">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => setInstruction(example)}
                className="w-full rounded-md bg-surface-2 px-3 py-1.5 text-left text-[12.5px] text-muted hover:text-foreground"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      )}

      <textarea
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, because this is a chat box; a newline is still there
          // on Shift-Enter for anyone writing more than a line.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }}
        placeholder="e.g. remove the second bullet under Northwind"
        className="mt-3 max-h-32 min-h-11 w-full resize-y rounded-md border border-line bg-surface-2 p-2.5 text-[13px] leading-relaxed outline-none focus:border-accent"
      />

      <button
        type="button"
        disabled={busy || instruction.trim().length < 3}
        onClick={() => void send()}
        className="mt-2 w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:text-[#0d1117]"
      >
        {busy ? "Reworking…" : "Send"}
      </button>
    </section>
  );
}
