import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "tailor_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * A token derived from the password, so the password itself never travels in a
 * cookie and a stolen cookie can't be read back into one. Deterministic, so
 * there is no session store to keep.
 */
export function sessionToken(password: string): string {
  return createHmac("sha256", password).update("resume-tailor-session-v1").digest("hex");
}

/** Constant-time compare of two hex tokens of equal length. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Compare a submitted password against the real one without leaking its length. */
export function passwordMatches(submitted: string, actual: string): boolean {
  return safeEqual(sessionToken(submitted), sessionToken(actual));
}
