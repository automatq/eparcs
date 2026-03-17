import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getPipelineStats } from "@/lib/analytics/pipeline-stats";
import { getSourceROI, getOutreachStats } from "@/lib/analytics/source-roi";

/**
 * GET /api/analytics — Full analytics data for the dashboard.
 */
export async function GET() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const [pipeline, sourceROI, outreach] = await Promise.all([
    getPipelineStats(userId),
    getSourceROI(userId),
    getOutreachStats(userId),
  ]);

  return NextResponse.json({ pipeline, sourceROI, outreach });
}
