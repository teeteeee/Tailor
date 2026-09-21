import { NextRequest, NextResponse } from "next/server";
import { dailyCounts, listUserApplications } from "@/lib/adminStats";
import { requireAdmin } from "@/lib/session";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

/** One person's applications and their per-day counts. Metadata only. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const [applications, daily] = await Promise.all([listUserApplications(id), dailyCounts(id)]);
    return NextResponse.json({ applications, daily });
  } catch (error) {
    return errorResponse(error);
  }
}
