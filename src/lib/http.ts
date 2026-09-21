import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { BadApiKeyError, MissingApiKeyError } from "./claude";
import { UnsupportedFileError } from "./extract";

/**
 * Map a thrown error to the message and status the UI should see. Split out
 * from errorResponse so streaming routes, which have already sent headers and
 * must report failures inside the stream, use exactly the same wording.
 */
export function describeError(error: unknown): { message: string; status: number } {
  if (error instanceof MissingApiKeyError) {
    return {
      message:
        "No Anthropic API key on the server. Put ANTHROPIC_API_KEY in .env.local at the project root, " +
        "then restart the dev server — env files are only read at startup.",
      status: 503,
    };
  }

  if (error instanceof BadApiKeyError) {
    return { message: error.message, status: 503 };
  }

  if (error instanceof Anthropic.AuthenticationError) {
    return {
      message:
        "Anthropic rejected the API key. It is the right shape, so it has most likely been revoked, " +
        "belongs to a different organisation, or was edited after you copied it. Generate a fresh key at " +
        "console.anthropic.com/settings/keys, put it in .env.local, and restart the dev server.",
      status: 401,
    };
  }

  if (error instanceof Anthropic.PermissionDeniedError) {
    return {
      message: "That API key is valid but not permitted to use this model. Check the key's workspace and permissions.",
      status: 403,
    };
  }

  if (error instanceof Anthropic.RateLimitError) {
    return { message: "Anthropic is rate limiting this key. Wait a moment and try again.", status: 429 };
  }

  if (error instanceof UnsupportedFileError) {
    return { message: error.message, status: 415 };
  }

  const message = error instanceof Error ? error.message : "Something went wrong.";
  const raw = typeof (error as { status?: number })?.status === "number" ? (error as { status: number }).status : 500;
  console.error("[resume-tailor]", error);
  return { message, status: raw >= 400 && raw < 600 ? raw : 500 };
}

/** Turn a thrown error into a response the UI can show verbatim. */
export function errorResponse(error: unknown): NextResponse {
  const { message, status } = describeError(error);
  return NextResponse.json({ error: message }, { status });
}
