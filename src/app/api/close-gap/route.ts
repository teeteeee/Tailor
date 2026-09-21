import { NextRequest, NextResponse } from "next/server";
import { closeGap } from "@/lib/claude";
import { applyChanges } from "@/lib/apply";
import { keywordCoverage } from "@/lib/keywords";
import { JobSchema, ResumeSchema } from "@/lib/schema";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { resume?: unknown; job?: unknown; gap?: string; evidence?: string };
    const resume = ResumeSchema.safeParse(body.resume);
    const job = JobSchema.safeParse(body.job);
    const gap = (body.gap ?? "").trim();
    const evidence = (body.evidence ?? "").trim();

    if (!resume.success || !job.success || !gap) {
      return NextResponse.json({ error: "Missing or malformed resume/job data." }, { status: 400 });
    }
    if (evidence.length < 15) {
      return NextResponse.json(
        { error: "Say a bit more about what you actually did — a sentence is enough." },
        { status: 400 },
      );
    }

    const filled = await closeGap(resume.data, job.data, gap, evidence);
    // The model returned only the edits; the resume is assembled here.
    const updated = applyChanges(resume.data, filled.changes);
    return NextResponse.json({
      resume: updated,
      changes: filled.changes,
      note: filled.note,
      coverage: keywordCoverage(updated, job.data.keywords),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
