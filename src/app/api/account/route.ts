import { NextRequest, NextResponse } from "next/server";
import { userFromRequest } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

/** Who the browser is signed in as, so the header can show it. */
export async function GET(request: NextRequest) {
  const user = await userFromRequest(request).catch(() => null);
  return NextResponse.json({
    email: user?.email ?? null,
    isAdmin: user ? isAdminEmail(user.email) : false,
  });
}
