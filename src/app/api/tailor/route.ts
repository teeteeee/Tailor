import { NextRequest, NextResponse } from "next/server";
import { analyzeJob, tailorResume } from "@/lib/claude";
import { keywordCoverage, keywordCoverageInText } from "@/lib/keywords";
import { describeError } from "@/lib/http";
import { UnfetchableUrlError, fetchJobPosting } from "@/lib/fetchJob";
import { saveRun } from "@/lib/runs";
import { userFromRequest } from "@/lib/session";
import { databaseConfigured, migrate } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Analyse the posting and tailor the resume at the same time.
 *
 * Tailoring reads the posting directly, so it does not wait on the analysis —
 * the two calls run concurrently and the slower one sets the total time. The
 * response is newline-delimited JSON: progress lines while the model writes,
 * then a single result line.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { resumeText?: string; jobText?: string; jobUrl?: string };
  const resumeText = (body.resumeText ?? "").trim();
  const pastedJob = (body.jobText ?? "").trim();
  const jobUrl = (body.jobUrl ?? "").trim();

  if (resumeText.length < 120 || (pastedJob.length < 80 && !jobUrl)) {
    return NextResponse.json({ error: "Missing or malformed resume/job text." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      let written = 0;
      const heartbeat = setInterval(() => send({ type: "progress", written }), 700);

      try {
        // A link is read here rather than in the browser, so giving one goes
        // straight to tailoring instead of making the user fetch, look, then ask.
        let jobText = pastedJob;
        if (jobUrl) {
          send({ type: "progress", written: 0, stage: "reading the posting" });
          jobText = await fetchJobPosting(jobUrl);
        }
        if (jobText.length < 80) {
          throw new UnfetchableUrlError("That posting had too little text to work from.");
        }
        const [job, result] = await Promise.all([
          analyzeJob(jobText),
          tailorResume(resumeText, jobText, (characters) => {
            written = characters;
          }),
        ]);

        const coverage = {
          before: keywordCoverageInText(resumeText, job.keywords),
          after: keywordCoverage(result.resume, job.keywords),
        };

        // Keep it in the signed-in user's history. A failure here must not cost
        // them the tailoring they just waited for, so it is reported as an id
        // of null rather than thrown.
        let runId: string | null = null;
        if (databaseConfigured()) {
          try {
            const user = await userFromRequest(request);
            if (user) {
              await migrate();
              runId = await saveRun(user.id, {
                resumeText,
                job,
                result,
                coverage,
                rejected: [],
                answers: [],
              });
            }
          } catch (error) {
            console.error("[resume-tailor] could not save run to history", error);
          }
        }

        send({ type: "result", job, result, coverage, runId });
      } catch (error) {
        // Headers are already sent, so a failure has to travel inside the stream.
        send({ type: "error", error: describeError(error).message });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Tells proxies not to buffer, which would defeat the point of streaming.
      "X-Accel-Buffering": "no",
    },
  });
}
