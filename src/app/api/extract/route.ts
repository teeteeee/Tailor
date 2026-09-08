import { NextRequest, NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES, extractText } from "@/lib/extract";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Pull the text out of an uploaded resume. Runs entirely on the server with no
 * model call, so uploads are instant and cost nothing.
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "That file is over 8 MB. Try a smaller one." }, { status: 413 });
    }

    const text = await extractText(file);
    if (text.trim().length < 120) {
      return NextResponse.json(
        { error: "That resume looks empty. If it's a scanned PDF, paste the text instead." },
        { status: 400 },
      );
    }
    return NextResponse.json({ text });
  } catch (error) {
    return errorResponse(error);
  }
}
