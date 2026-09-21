import { NextRequest, NextResponse } from "next/server";
import { UnfetchableUrlError, fetchJobPosting } from "@/lib/fetchJob";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Turn a posting link into its text, which the user then sees and can edit. */
export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url?: string };
    if (!url?.trim()) return NextResponse.json({ error: "Paste a link first." }, { status: 400 });

    return NextResponse.json({ text: await fetchJobPosting(url) });
  } catch (error) {
    if (error instanceof UnfetchableUrlError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return errorResponse(error);
  }
}
