import { NextRequest, NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES, extractText } from "@/lib/extract";
import { parseResume } from "@/lib/claude";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Upload a file (or paste text) and get back a structured resume. */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let text: string;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "That file is over 8 MB. Try a smaller one." }, { status: 413 });
      }
      text = await extractText(file);
    } else {
      const body = (await request.json()) as { text?: string };
      text = (body.text ?? "").trim();
    }

    if (text.length < 120) {
      return NextResponse.json(
        { error: "That resume looks empty. If it's a scanned PDF, paste the text instead." },
        { status: 400 },
      );
    }

    const resume = await parseResume(text);
    return NextResponse.json({ resume, rawText: text });
  } catch (error) {
    return errorResponse(error);
  }
}
