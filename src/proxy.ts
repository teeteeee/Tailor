import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/auth";

/** Reachable without a session, or there would be no way to sign in. */
const OPEN_PATHS = new Set(["/login", "/api/login"]);

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  const { pathname } = request.nextUrl;

  if (!password) {
    // Open locally so development needs no setup, but fail closed once
    // deployed: a public URL wired to a billable API key must not be reachable
    // just because an environment variable was forgotten.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("This deployment has no APP_PASSWORD set, so it is closed.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (OPEN_PATHS.has(pathname)) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (safeEqual(cookie, sessionToken(password))) return NextResponse.next();

  // An expired session mid-use should read as an error, not a redirect to HTML.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Session expired — reload and sign in again." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
