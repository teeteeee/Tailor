import { NextRequest, NextResponse } from "next/server";
import { writeCoverLetter } from "@/lib/claude";
import { JobSchema, ResumeSchema } from "@/lib/schema";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
// Vercel's free tier caps function duration well below 300s; 60 deploys everywhere.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { resume?: unknown; job?: unknown; notes?: string };
    const resume = ResumeSchema.safeParse(body.resume);
    const job = JobSchema.safeParse(body.job);
    if (!resume.success || !job.success) {
      return NextResponse.json({ error: "Missing or malformed resume/job data." }, { status: 400 });
    }
    return NextResponse.json({ letter: await writeCoverLetter(resume.data, job.data, body.notes ?? "") });
  } catch (error) {
    return errorResponse(error);
  }
}
