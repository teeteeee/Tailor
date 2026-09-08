import { NextResponse } from "next/server";
import { MissingApiKeyError } from "./claude";
import { UnsupportedFileError } from "./extract";

/** Turn a thrown error into a response the UI can show verbatim. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof MissingApiKeyError) {
    return NextResponse.json(
      { error: "The server has no Anthropic API key. Set ANTHROPIC_API_KEY and restart." },
      { status: 503 },
    );
  }
  if (error instanceof UnsupportedFileError) {
    return NextResponse.json({ error: error.message }, { status: 415 });
  }
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const status = typeof (error as { status?: number })?.status === "number" ? (error as { status: number }).status : 500;
  console.error("[resume-tailor]", error);
  return NextResponse.json({ error: message }, { status: status >= 400 && status < 600 ? status : 500 });
}
