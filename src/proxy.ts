import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decideAccess } from "@/lib/access";
import { databaseConfigured } from "@/lib/db";

export function proxy(request: NextRequest) {
  const decision = decideAccess({
    pathname: request.nextUrl.pathname,
    password: process.env.APP_PASSWORD,
    isPublic: process.env.APP_PUBLIC === "true",
    isProduction: process.env.NODE_ENV === "production",
    cookie: request.cookies.get(SESSION_COOKIE)?.value ?? "",
    hasAccounts: databaseConfigured(),
  });

  switch (decision.type) {
    case "allow":
      return NextResponse.next();

    case "closed":
      return new NextResponse(
        "This deployment has neither APP_PASSWORD nor APP_PUBLIC set, so it is closed.",
        { status: 503, headers: { "Content-Type": "text/plain" } },
      );

    case "unauthorized":
      return NextResponse.json({ error: "Session expired — reload and sign in again." }, { status: 401 });

    case "login": {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
