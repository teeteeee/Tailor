import { NextRequest, NextResponse } from "next/server";
import { analyzeJob, tailorResume } from "@/lib/claude";
import { keywordCoverage, keywordCoverageInText } from "@/lib/keywords";
import { describeError } from "@/lib/http";

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
  const body = (await request.json()) as { resumeText?: string; jobText?: string };
  const resumeText = (body.resumeText ?? "").trim();
  const jobText = (body.jobText ?? "").trim();

  if (resumeText.length < 120 || jobText.length < 80) {
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
        const [job, result] = await Promise.all([
          analyzeJob(jobText),
          tailorResume(resumeText, jobText, (characters) => {
            written = characters;
          }),
        ]);

        send({
          type: "result",
          job,
          result,
          coverage: {
            before: keywordCoverageInText(resumeText, job.keywords),
            after: keywordCoverage(result.resume, job.keywords),
          },
        });
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
