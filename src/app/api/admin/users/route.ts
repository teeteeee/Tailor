import { NextRequest, NextResponse } from "next/server";
import { listUserActivity, type ActivitySort } from "@/lib/adminStats";
import { requireAdmin } from "@/lib/session";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const params = request.nextUrl.searchParams;
    const sort = params.get("sort");
    return NextResponse.json({
      users: await listUserActivity({
        query: params.get("q") ?? "",
        sort: (["recent", "most", "email"].includes(sort ?? "") ? sort : "recent") as ActivitySort,
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
