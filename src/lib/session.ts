import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, userForSession, type User } from "./accounts";
import { databaseConfigured } from "./db";

export { SESSION_COOKIE };

/** Who is signed in, for a server component. Null when nobody is. */
export async function currentUser(): Promise<User | null> {
  if (!databaseConfigured()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  return userForSession(token);
}

/** Who is signed in, for a route handler. */
export async function userFromRequest(request: NextRequest): Promise<User | null> {
  if (!databaseConfigured()) return null;
  return userForSession(request.cookies.get(SESSION_COOKIE)?.value ?? "");
}

/**
 * The guard every account-only route uses. The proxy redirects unauthenticated
 * page requests as a convenience, but authorization is decided here — a forged
 * cookie gets past a cookie-presence check and must fail at the real one.
 */
export async function requireUser(request: NextRequest): Promise<User | NextResponse> {
  const user = await userFromRequest(request);
  if (user) return user;
  return NextResponse.json({ error: "Sign in to do that." }, { status: 401 });
}

export function attachSession(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return response;
}

export function clearSession(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
