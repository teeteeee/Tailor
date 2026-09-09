import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/claude";
import { JobSchema, ResumeSchema } from "@/lib/schema";
import { describeError } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Streams the answer as newline-delimited JSON: delta lines, then a done line. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { resume?: unknown; job?: unknown; question?: string };
  const resume = ResumeSchema.safeParse(body.resume);
  const job = JobSchema.safeParse(body.job);
  const question = (body.question ?? "").trim();

  if (!resume.success || !job.success) {
    return NextResponse.json({ error: "Missing or malformed resume/job data." }, { status: 400 });
  }
  if (question.length < 5) {
    return NextResponse.json({ error: "Paste the question you want answered." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      try {
        const answer = await answerQuestion(resume.data, job.data, question, (text) =>
          send({ type: "delta", text }),
        );
        send({ type: "result", answer });
      } catch (error) {
        send({ type: "error", error: describeError(error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
