import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, passwordMatches, sessionToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "This deployment has no password set." }, { status: 503 });
  }

  const { password: submitted } = (await request.json()) as { password?: string };
  if (!submitted || !passwordMatches(submitted, password)) {
    // Slow down guessing. Not a rate limiter, but it makes a brute force loud and slow.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
