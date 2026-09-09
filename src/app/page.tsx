"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Answers, type Answer } from "@/components/Answers";
import { ChangeList } from "@/components/ChangeList";
import { Coverage } from "@/components/Coverage";
import { Dropzone } from "@/components/Dropzone";
import { Gaps, type GapState } from "@/components/Gaps";
import { ResumePreview } from "@/components/ResumePreview";
import { ScoreRing } from "@/components/ScoreRing";
import { applyRejections, mergeChanges } from "@/lib/apply";
import { postNdjson } from "@/lib/ndjson";
import { coverageRatio, type KeywordHit } from "@/lib/keywords";
import {
  describeAge,
  forgetResume,
  getResumeSnapshot,
  getServerResumeSnapshot,
  parseResumeSnapshot,
  saveResume,
  subscribeResume,
} from "@/lib/storage";
import type { Change, Job, Resume, TailorResult } from "@/lib/schema";

type Coverages = { before: KeywordHit[]; after: KeywordHit[] };
type Stage = "idle" | "reading" | "tailoring";

const STAGE_TEXT: Record<Exclude<Stage, "idle">, string> = {
  reading: "Reading your resume…",
  tailoring: "Tailoring, bullet by bullet…",
};

const MIN_RESUME_CHARS = 120;
const MIN_JOB_CHARS = 80;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? `Request to ${url} failed.`);
  return data as T;
}

export default function Home() {
  // `draft` is what the user has typed or uploaded this session; until they
  // touch anything it is null and the saved resume shows through.
  const [draft, setDraft] = useState<string | null>(null);
  const [draftFilename, setDraftFilename] = useState<string | null>(null);
  const [jobText, setJobText] = useState("");

  const rawSaved = useSyncExternalStore(subscribeResume, getResumeSnapshot, getServerResumeSnapshot);
  const saved = useMemo(() => parseResumeSnapshot(rawSaved), [rawSaved]);

  const resumeText = draft ?? saved?.text ?? "";
  const filename = draft === null ? saved?.filename || null : draftFilename;
  const [stage, setStage] = useState<Stage>("idle");
  const [written, setWritten] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [coverage, setCoverage] = useState<Coverages | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  const [letter, setLetter] = useState<string | null>(null);
  const [letterBusy, setLetterBusy] = useState(false);

  const [answers, setAnswers] = useState<Answer[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState<Answer | null>(null);
  const [answerBusy, setAnswerBusy] = useState(false);

  const [gapState, setGapState] = useState<Record<string, GapState>>({});
  const [busyGap, setBusyGap] = useState<string | null>(null);

  const busy = stage !== "idle";

  // Keep the stored copy in step with the box, so a pasted resume is remembered
  // as readily as an uploaded one. Writing to storage is an external-system
  // update, which is what an effect is for; the store notifies React itself.
  useEffect(() => {
    if (draft === null || draft.trim().length < MIN_RESUME_CHARS) return;
    if (saved?.text === draft && (saved?.filename || "") === (draftFilename ?? "")) return;
    const timer = setTimeout(() => saveResume(draft, draftFilename ?? ""), 800);
    return () => clearTimeout(timer);
  }, [draft, draftFilename, saved]);

  function handleForget() {
    forgetResume();
    setDraft("");
    setDraftFilename(null);
  }

  /** What the user actually gets: the tailored resume minus rejected changes. */
  const finalResume: Resume | null = useMemo(
    () => (result ? applyRejections(result.resume, result.changes, rejected) : null),
    [result, rejected],
  );

  async function handleFile(file: File) {
    setError(null);
    setDraftFilename(file.name);
    setDraft((current) => current ?? "");
    setStage("reading");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/extract", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not read that file.");
      setDraft(data.text as string);
    } catch (cause) {
      setDraftFilename(null);
      setError(cause instanceof Error ? cause.message : "Could not read that file.");
    } finally {
      setStage("idle");
    }
  }

  async function handleTailor() {
    setError(null);
    setLetter(null);
    try {
      setStage("tailoring");
      setWritten(0);
      let tailored: { job: Job; result: TailorResult; coverage: Coverages } | null = null;
      await postNdjson("/api/tailor", { resumeText, jobText }, (event) => {
        if (event.type === "progress") setWritten(Number(event.written ?? 0));
        else if (event.type === "result") {
          tailored = event as unknown as { job: Job; result: TailorResult; coverage: Coverages };
        }
      });
      if (!tailored) throw new Error("The server closed the connection before finishing.");
      const { job: analysed, result: tailoredResult, coverage: tailoredCoverage } = tailored;
      setJob(analysed);
      setResult(tailoredResult);
      setCoverage(tailoredCoverage);
      setRejected(new Set());
      setGapState({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setStage("idle");
    }
  }

  async function handleExport(format: "pdf" | "docx" | "md" | "txt") {
    if (!finalResume) return;
    setError(null);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: finalResume, format }),
      });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string })?.error ?? "Export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(finalResume.contact.name || "resume").toLowerCase().replace(/\s+/g, "-")}-resume.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.");
    }
  }

  async function handleCoverLetter() {
    if (!finalResume || !job) return;
    setLetterBusy(true);
    setError(null);
    try {
      const data = await postJson<{ letter: string }>("/api/cover-letter", { resume: finalResume, job, notes: "" });
      setLetter(data.letter);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not write the cover letter.");
    } finally {
      setLetterBusy(false);
    }
  }

  /**
   * Fold the candidate's own account of some experience into the resume. The
   * result arrives as ordinary changes, so it stays reviewable and revertible
   * like everything else the model wrote.
   */
  async function handleCloseGap(gap: string, evidence: string) {
    if (!result || !job || !finalResume) return;
    setBusyGap(gap);
    setError(null);
    try {
      const data = await postJson<{
        resume: Resume;
        changes: Change[];
        note: string;
        coverage: KeywordHit[];
      }>("/api/close-gap", { resume: finalResume, job, gap, evidence });

      if (data.changes.length === 0) {
        setGapState((previous) => ({
          ...previous,
          [gap]: { closed: false, note: data.note || "That didn't look like evidence for this one." },
        }));
        return;
      }

      setResult({ ...result, resume: data.resume, changes: mergeChanges(result.changes, data.changes) });
      setCoverage((previous) => (previous ? { ...previous, after: data.coverage } : previous));
      setGapState((previous) => ({ ...previous, [gap]: { closed: true, note: "" } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add that.");
    } finally {
      setBusyGap(null);
    }
  }

  /** Answer one application question from the tailored resume and the posting. */
  async function handleAsk(question: string) {
    if (!finalResume || !job) return;
    setAnswerBusy(true);
    setError(null);
    setStreamingAnswer({ question: question.trim(), text: "" });
    try {
      let text = "";
      await postNdjson("/api/answer", { resume: finalResume, job, question }, (event) => {
        if (event.type === "delta") {
          text += String(event.text ?? "");
          setStreamingAnswer({ question: question.trim(), text });
        } else if (event.type === "result") {
          text = String(event.answer ?? text);
        }
      });
      setAnswers((previous) => [{ question: question.trim(), text }, ...previous]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not answer that.");
    } finally {
      setStreamingAnswer(null);
      setAnswerBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setCoverage(null);
    setJob(null);
    setLetter(null);
    setRejected(new Set());
    setGapState({});
    setAnswers([]);
    setStreamingAnswer(null);
    setError(null);
  }

  const toggle = (id: string) =>
    setRejected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="no-print mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Resume <span className="text-accent">Tailor</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Rewrites what you already did so the right parts land first. It never invents experience.
          </p>
        </div>
        {result ? (
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            Tailor another
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="no-print mb-6 rounded-md border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">{error}</div>
      ) : null}

      {!result ? (
        <div className="no-print grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold tracking-wide uppercase">1 · Your resume</h2>

            {saved ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-good-soft px-3 py-2 text-[12.5px] text-good">
                <span>
                  Using your saved resume
                  {saved.filename ? ` (${saved.filename})` : ""} · kept {describeAge(saved.savedAt)}
                </span>
                <button type="button" onClick={handleForget} className="underline underline-offset-2 hover:opacity-80">
                  Forget it
                </button>
              </div>
            ) : null}

            <div className="mt-4">
              <Dropzone onFile={handleFile} filename={filename} busy={busy} />
            </div>
            <textarea
              value={resumeText}
              onChange={(event) => {
                setDraft(event.target.value);
                setDraftFilename(null);
              }}
              placeholder="…or paste your resume text here."
              className="mt-4 max-h-[26rem] min-h-[16rem] w-full resize-y rounded-md border border-line bg-surface-2 p-3 font-mono text-xs leading-relaxed outline-none focus:border-accent"
            />
            <p className="mt-2 text-xs text-muted">{resumeText.length.toLocaleString()} characters</p>
          </section>

          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold tracking-wide uppercase">2 · The job posting</h2>
            <textarea
              value={jobText}
              onChange={(event) => setJobText(event.target.value)}
              placeholder="Paste the full job description — requirements, responsibilities, the lot."
              className="mt-4 max-h-[32rem] min-h-[22rem] w-full resize-y rounded-md border border-line bg-surface-2 p-3 text-sm leading-relaxed outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={busy || resumeText.trim().length < MIN_RESUME_CHARS || jobText.trim().length < MIN_JOB_CHARS}
              onClick={handleTailor}
              className="mt-4 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#0d1117]"
            >
              {busy ? STAGE_TEXT[stage as Exclude<Stage, "idle">] : "Tailor my resume"}
            </button>
            {busy ? (
              <>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${Math.min(95, 6 + (written / 4500) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-center text-xs text-muted">
                  {written > 0 ? `${written.toLocaleString()} characters written` : "Reading the posting…"}
                </p>
              </>
            ) : null}
          </section>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <div>
            {finalResume ? <ResumePreview resume={finalResume} /> : null}
            <Answers answers={answers} streaming={streamingAnswer} busy={answerBusy} onAsk={handleAsk} />
          </div>

          <aside className="no-print space-y-5">
            <section className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-4">
                <ScoreRing score={result.matchScore} label="Match" />
                {coverage ? <ScoreRing score={coverageRatio(coverage.after)} label="Keywords" /> : null}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">{result.scoreRationale}</p>
              {coverage ? (
                <p className="mt-2 text-xs text-muted">
                  Keyword coverage {coverageRatio(coverage.before)}% → {coverageRatio(coverage.after)}%
                </p>
              ) : null}
            </section>

            <section className="rounded-xl border border-line bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold">Changes</h2>
              <ChangeList
                changes={result.changes}
                rejected={rejected}
                onToggle={toggle}
                onSetAll={(accept) => setRejected(accept ? new Set() : new Set(result.changes.map((c) => c.id)))}
              />
            </section>

            <section className="rounded-xl border border-line bg-surface p-4">
              <button
                type="button"
                onClick={() => handleExport("pdf")}
                className="w-full rounded-md bg-accent px-4 py-3 text-sm font-medium text-white dark:text-[#0d1117]"
              >
                Download resume
              </button>
              <p className="mt-2 text-center text-xs text-muted">
                PDF ·{" "}
                {(["docx", "md", "txt"] as const).map((format, index) => (
                  <span key={format}>
                    {index > 0 ? " · " : ""}
                    <button
                      type="button"
                      onClick={() => handleExport(format)}
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      {{ docx: "Word", md: "Markdown", txt: "Plain text" }[format]}
                    </button>
                  </span>
                ))}
              </p>
            </section>

            {coverage ? (
              <section className="rounded-xl border border-line bg-surface p-4">
                <h2 className="mb-1 text-sm font-semibold">Keywords from the posting</h2>
                <p className="mb-3 text-xs text-muted">Struck through means absent; + means tailoring surfaced it.</p>
                <Coverage before={coverage.before} after={coverage.after} />
              </section>
            ) : null}

            {result.gaps.length > 0 ? (
              <section className="rounded-xl border border-line bg-surface p-4">
                <h2 className="mb-2 text-sm font-semibold">Genuine gaps</h2>
                <p className="mb-2 text-xs text-muted">
                  Nothing on your resume evidences these. Click one if you have actually done it and left it out.
                </p>
                <Gaps gaps={result.gaps} state={gapState} busyGap={busyGap} onClose={handleCloseGap} />
              </section>
            ) : null}

            {result.interviewTalkingPoints.length > 0 ? (
              <section className="rounded-xl border border-line bg-surface p-4">
                <h2 className="mb-2 text-sm font-semibold">Lead with these</h2>
                <ul className="list-disc space-y-1.5 pl-4 text-[12.5px] leading-relaxed">
                  {result.interviewTalkingPoints.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="rounded-xl border border-line bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold">Cover letter</h2>
              {letter ? (
                <>
                  <p className="text-[12.5px] whitespace-pre-wrap">{letter}</p>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(letter)}
                    className="mt-3 rounded-md border border-line px-3 py-1.5 text-xs hover:bg-surface-2"
                  >
                    Copy
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleCoverLetter}
                  disabled={letterBusy}
                  className="w-full rounded-md border border-line px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
                >
                  {letterBusy ? "Writing…" : "Draft one from this resume"}
                </button>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
