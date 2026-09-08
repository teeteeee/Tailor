import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { BadApiKeyError, MissingApiKeyError } from "./claude";
import { UnsupportedFileError } from "./extract";

/** Turn a thrown error into a response the UI can show verbatim. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof MissingApiKeyError) {
    return NextResponse.json(
      {
        error:
          "No Anthropic API key on the server. Put ANTHROPIC_API_KEY in .env.local at the project root, " +
          "then restart the dev server — env files are only read at startup.",
      },
      { status: 503 },
    );
  }

  if (error instanceof BadApiKeyError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  if (error instanceof Anthropic.AuthenticationError) {
    return NextResponse.json(
      {
        error:
          "Anthropic rejected the API key. It is the right shape, so it has most likely been revoked, " +
          "belongs to a different organisation, or was edited after you copied it. Generate a fresh key at " +
          "console.anthropic.com/settings/keys, put it in .env.local, and restart the dev server.",
      },
      { status: 401 },
    );
  }

  if (error instanceof Anthropic.PermissionDeniedError) {
    return NextResponse.json(
      { error: "That API key is valid but not permitted to use this model. Check the key's workspace and permissions." },
      { status: 403 },
    );
  }

  if (error instanceof Anthropic.RateLimitError) {
    return NextResponse.json({ error: "Anthropic is rate limiting this key. Wait a moment and try again." }, { status: 429 });
  }

  if (error instanceof UnsupportedFileError) {
    return NextResponse.json({ error: error.message }, { status: 415 });
  }

  const message = error instanceof Error ? error.message : "Something went wrong.";
  const status = typeof (error as { status?: number })?.status === "number" ? (error as { status: number }).status : 500;
  console.error("[resume-tailor]", error);
  return NextResponse.json({ error: message }, { status: status >= 400 && status < 600 ? status : 500 });
}
