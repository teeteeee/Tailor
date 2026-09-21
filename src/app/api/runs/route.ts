import { NextRequest, NextResponse } from "next/server";
import { listRuns } from "@/lib/runs";
import { requireUser } from "@/lib/session";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (user instanceof NextResponse) return user;

    const params = request.nextUrl.searchParams;
    const days = Number(params.get("days"));
    return NextResponse.json({
      runs: await listRuns(user.id, {
        query: params.get("q") ?? "",
        pinnedOnly: params.get("pinned") === "true",
        since: Number.isFinite(days) && days > 0 ? new Date(Date.now() - days * 86_400_000) : undefined,
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
