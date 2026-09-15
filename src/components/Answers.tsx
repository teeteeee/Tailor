"use client";

import { useState } from "react";

export type Answer = { question: string; text: string };

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

function AnswerCard({ answer }: { answer: Answer }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-4">
      <p className="text-xs font-medium text-muted">{answer.question}</p>
      <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap">{answer.text}</p>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(answer.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs hover:bg-surface-2"
        >
          {copied ? "Copied" : "Copy answer"}
        </button>
        <span className="text-xs text-muted">
          {wordCount(answer.text)} words · {answer.text.length} characters
        </span>
      </div>
    </div>
  );
}

export function Answers({
  answers,
  streaming,
  busy,
  onAsk,
}: {
  answers: Answer[];
  streaming: Answer | null;
  busy: boolean;
  onAsk: (question: string) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");

  return (
    <section className="no-print mx-auto mt-6 max-w-[52rem] rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold">Application questions</h2>
      <p className="mt-1 text-xs text-muted">
        Paste a question from the application. Answers are drawn from this tailored resume and this
        posting — nothing else gets claimed on your behalf.
      </p>

      <textarea
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="e.g. Tell us about a time you owned a system end to end."
        className="mt-3 max-h-40 min-h-20 w-full resize-y rounded-md border border-line bg-surface-2 p-3 text-sm leading-relaxed outline-none focus:border-accent"
      />

      <button
        type="button"
        disabled={busy || question.trim().length < 5}
        onClick={async () => {
          await onAsk(question);
          setQuestion("");
        }}
        className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:text-[#0d1117]"
      >
        {busy ? "Writing…" : "Answer it"}
      </button>

      {streaming ? (
        <div className="mt-4 rounded-lg border border-line bg-surface-2 p-4">
          <p className="text-xs font-medium text-muted">{streaming.question}</p>
          <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap">
            {streaming.text}
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" />
          </p>
        </div>
      ) : null}

      {answers.length > 0 ? (
        <div className="mt-4 space-y-3">
          {answers.map((answer, index) => (
            <AnswerCard key={index} answer={answer} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
