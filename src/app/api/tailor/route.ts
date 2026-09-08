import { NextRequest, NextResponse } from "next/server";
import { tailorResume } from "@/lib/claude";
import { keywordCoverage } from "@/lib/keywords";
import { JobSchema, ResumeSchema } from "@/lib/schema";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { resume?: unknown; job?: unknown };
    const resume = ResumeSchema.safeParse(body.resume);
    const job = JobSchema.safeParse(body.job);
    if (!resume.success || !job.success) {
      return NextResponse.json({ error: "Missing or malformed resume/job data." }, { status: 400 });
    }

    const result = await tailorResume(resume.data, job.data);
    return NextResponse.json({
      result,
      coverage: {
        before: keywordCoverage(resume.data, job.data.keywords),
        after: keywordCoverage(result.resume, job.data.keywords),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
