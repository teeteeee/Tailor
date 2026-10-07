import { NextRequest, NextResponse } from "next/server";
import { refineResume, type RefineTurn } from "@/lib/claude";
import { applyChanges } from "@/lib/apply";
import { keywordCoverage } from "@/lib/keywords";
import { screenRefinement } from "@/lib/refine";
import { toPlainText } from "@/lib/export";
import { JobSchema, ResumeSchema } from "@/lib/schema";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Rework the tailored resume from an instruction the candidate typed.
 *
 * Like closing a gap, this is a path that can put new wording on the resume,
 * and for the same reason: the candidate is telling you about their own career.
 * What they did not say is screened out before anything is applied.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      resume?: unknown;
      job?: unknown;
      instruction?: string;
      history?: unknown;
    };

    const resume = ResumeSchema.safeParse(body.resume);
    const job = JobSchema.safeParse(body.job);
    const instruction = (body.instruction ?? "").trim();

    if (!resume.success || !job.success) {
      return NextResponse.json({ error: "Missing or malformed resume/job data." }, { status: 400 });
    }
    if (instruction.length < 3) {
      return NextResponse.json({ error: "Say what you would like changed." }, { status: 400 });
    }
    if (instruction.length > 2000) {
      return NextResponse.json({ error: "That is longer than an instruction needs to be." }, { status: 413 });
    }

    const history: RefineTurn[] = Array.isArray(body.history)
      ? body.history
          .filter((turn): turn is RefineTurn =>
            Boolean(turn) &&
            typeof turn === "object" &&
            typeof (turn as RefineTurn).text === "string" &&
            ((turn as RefineTurn).role === "user" || (turn as RefineTurn).role === "assistant"),
          )
          .slice(-6)
      : [];

    const refined = await refineResume(resume.data, job.data, instruction, history);

    const { changes, refused } = screenRefinement(refined.changes, {
      resumeText: toPlainText(resume.data),
      instruction,
    });

    // The model returned only the edits; the resume is assembled here.
    const updated = applyChanges(resume.data, changes);

    // When everything was refused the model's own reply describes work that did
    // not happen — "Added a line about mentoring." followed by the reason it
    // was not added. The refusals are the whole truth in that case, so they are
    // the whole answer.
    const reply =
      refused.length > 0 && changes.length === 0
        ? refused.join(" ")
        : [refined.reply.trim(), ...refused].filter(Boolean).join(" ");

    return NextResponse.json({
      resume: updated,
      changes,
      reply: reply || "Nothing changed.",
      coverage: keywordCoverage(updated, job.data.keywords),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
