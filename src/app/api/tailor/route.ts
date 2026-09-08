import { NextRequest, NextResponse } from "next/server";
import { tailorResume } from "@/lib/claude";
import { keywordCoverage, keywordCoverageInText } from "@/lib/keywords";
import { JobSchema } from "@/lib/schema";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
// Vercel's free tier caps function duration well below 300s; 60 deploys everywhere.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { resumeText?: string; job?: unknown };
    const resumeText = (body.resumeText ?? "").trim();
    const job = JobSchema.safeParse(body.job);
    if (resumeText.length < 120 || !job.success) {
      return NextResponse.json({ error: "Missing or malformed resume/job data." }, { status: 400 });
    }

    const result = await tailorResume(resumeText, job.data);
    return NextResponse.json({
      result,
      coverage: {
        before: keywordCoverageInText(resumeText, job.data.keywords),
        after: keywordCoverage(result.resume, job.data.keywords),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
