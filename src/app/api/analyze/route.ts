import { NextRequest, NextResponse } from "next/server";
import { analyzeJob } from "@/lib/claude";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
// Vercel's free tier caps function duration well below 300s; 60 deploys everywhere.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { text } = (await request.json()) as { text?: string };
    const jobText = (text ?? "").trim();
    if (jobText.length < 80) {
      return NextResponse.json({ error: "Paste the full job posting — that's too short to work with." }, { status: 400 });
    }
    return NextResponse.json({ job: await analyzeJob(jobText) });
  } catch (error) {
    return errorResponse(error);
  }
}
