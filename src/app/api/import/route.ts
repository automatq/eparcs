import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/import — Import leads from CSV.
 * Body: { leads: [{name, title, company, email, phone, linkedinUrl, source}] }
 */
export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { leads = [] } = body;

  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: "No leads provided" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;

  for (const row of leads) {
    // Skip rows without a name
    if (!row.name && !row.company) { skipped++; continue; }

    // Check for duplicate
    if (row.linkedinUrl) {
      const existing = await db.lead.findFirst({
        where: { linkedinUrl: row.linkedinUrl, ownerId: userId },
      });
      if (existing) { skipped++; continue; }
    }

    const lead = await db.lead.create({
      data: {
        name: row.name ?? row.company ?? "Unknown",
        title: row.title ?? null,
        company: row.company ?? null,
        industry: row.industry ?? null,
        location: row.location ?? null,
        linkedinUrl: row.linkedinUrl ?? null,
        source: row.source ?? "import",
        leadType: row.leadType ?? "person",
        pipelineStage: "new",
        enrichmentStatus: "none",
        ownerId: userId,
      },
    });

    // Add email if provided
    if (row.email) {
      await db.leadEmail.create({
        data: {
          leadId: lead.id,
          email: row.email,
          source: "import",
          confidence: 50,
        },
      });
    }

    // Add phone if provided
    if (row.phone) {
      await db.leadPhone.create({
        data: {
          leadId: lead.id,
          phone: row.phone,
          source: "import",
          type: "main",
        },
      });
    }

    imported++;
  }

  return NextResponse.json({
    message: `Imported ${imported} leads, skipped ${skipped} duplicates`,
    imported,
    skipped,
  });
}
