import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/export — Export leads as CSV.
 * Query: ?source=gmaps&stage=new (optional filters)
 */
export async function GET(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const stage = searchParams.get("stage");

  const where: any = { ownerId: userId };
  if (source) where.source = source;
  if (stage) where.pipelineStage = stage;

  const leads = await db.lead.findMany({
    where,
    include: {
      emails: true,
      phones: true,
      businessProfile: true,
      companyProfile: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Build CSV
  const headers = [
    "Name", "Title", "Company", "Industry", "Location", "Source",
    "Pipeline Stage", "Email", "Email Verified", "Phone",
    "LinkedIn URL", "Website", "Rating", "Review Count", "Category",
    "Employee Count", "Revenue Estimate", "Founded Year",
    "Created At",
  ];

  const rows = leads.map((lead) => [
    lead.name,
    lead.title ?? "",
    lead.company ?? "",
    lead.industry ?? "",
    lead.location ?? "",
    lead.source,
    lead.pipelineStage,
    lead.emails[0]?.email ?? "",
    lead.emails[0]?.verified ? "Yes" : "No",
    lead.phones[0]?.phone ?? lead.businessProfile?.phone ?? "",
    lead.linkedinUrl ?? "",
    lead.businessProfile?.website ?? "",
    lead.businessProfile?.rating?.toString() ?? "",
    lead.businessProfile?.reviewCount?.toString() ?? "",
    lead.businessProfile?.category ?? "",
    lead.companyProfile?.employeeCount?.toString() ?? "",
    lead.companyProfile?.estimatedRevenue?.toString() ?? "",
    lead.companyProfile?.foundedYear?.toString() ?? "",
    lead.createdAt.toISOString(),
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="scraped-leads-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
