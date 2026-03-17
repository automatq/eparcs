import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getJobStatus } from "@/lib/scraper/maps-agent";
import { getLinkedInJobStatus } from "@/lib/scraper/linkedin-agent";

/**
 * GET /api/scraper/status?jobId=xxx — Check scrape job progress.
 */
export async function GET(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const status = jobId.startsWith("linkedin-")
    ? getLinkedInJobStatus(jobId)
    : getJobStatus(jobId);

  if (!status) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(status);
}
