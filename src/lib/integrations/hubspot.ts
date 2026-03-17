/**
 * HubSpot Integration
 *
 * Bi-directional sync: push leads + deal stages + outreach activity to HubSpot.
 */

import { db } from "@/lib/db";

const HUBSPOT_API = "https://api.hubapi.com";

interface HubSpotContact {
  id?: string;
  properties: Record<string, string>;
}

async function hubspotFetch(
  accessToken: string,
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HubSpot API error: ${res.status}`);
  return res.json();
}

/**
 * Push a lead to HubSpot as a contact.
 */
export async function pushLeadToHubSpot(
  accessToken: string,
  lead: {
    name: string;
    title?: string | null;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    source: string;
    pipelineStage: string;
  },
  fieldMapping?: Record<string, string>
): Promise<string> {
  const nameParts = lead.name.split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") ?? "";

  const properties: Record<string, string> = {
    firstname: firstName,
    lastname: lastName,
    ...(lead.email && { email: lead.email }),
    ...(lead.phone && { phone: lead.phone }),
    ...(lead.company && { company: lead.company }),
    ...(lead.title && { jobtitle: lead.title }),
    ...(lead.location && { city: lead.location }),
    lifecyclestage: mapPipelineToHubSpot(lead.pipelineStage),
    hs_lead_status: mapStageToLeadStatus(lead.pipelineStage),
  };

  // Apply custom field mapping
  if (fieldMapping) {
    const mapping = typeof fieldMapping === "string" ? JSON.parse(fieldMapping) : fieldMapping;
    for (const [scrapedField, hubspotField] of Object.entries(mapping)) {
      const value = (lead as any)[scrapedField];
      if (value) properties[hubspotField as string] = String(value);
    }
  }

  const result = await hubspotFetch(accessToken, "/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({ properties }),
  });

  return result.id;
}

/**
 * Update a HubSpot contact's lifecycle stage.
 */
export async function updateHubSpotStage(
  accessToken: string,
  contactId: string,
  pipelineStage: string
): Promise<void> {
  await hubspotFetch(accessToken, `/crm/v3/objects/contacts/${contactId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        lifecyclestage: mapPipelineToHubSpot(pipelineStage),
        hs_lead_status: mapStageToLeadStatus(pipelineStage),
      },
    }),
  });
}

/**
 * Sync all leads for an owner to HubSpot.
 */
export async function syncAllToHubSpot(ownerId: string): Promise<{
  synced: number;
  errors: number;
}> {
  const connection = await db.cRMConnection.findUnique({
    where: { ownerId_provider: { ownerId, provider: "hubspot" } },
  });

  if (!connection || connection.status !== "active") {
    throw new Error("HubSpot not connected");
  }

  const leads = await db.lead.findMany({
    where: { ownerId },
    include: { emails: { take: 1 }, phones: { take: 1 } },
  });

  let synced = 0;
  let errors = 0;

  for (const lead of leads) {
    try {
      await pushLeadToHubSpot(
        connection.accessToken,
        {
          name: lead.name,
          title: lead.title,
          company: lead.company,
          email: lead.emails[0]?.email,
          phone: lead.phones[0]?.phone,
          location: lead.location,
          source: lead.source,
          pipelineStage: lead.pipelineStage,
        },
        connection.fieldMapping ? JSON.parse(connection.fieldMapping) : undefined
      );
      synced++;
    } catch {
      errors++;
    }
  }

  await db.cRMConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  return { synced, errors };
}

function mapPipelineToHubSpot(stage: string): string {
  const map: Record<string, string> = {
    new: "lead",
    contacted: "marketingqualifiedlead",
    replied: "salesqualifiedlead",
    meeting: "opportunity",
    won: "customer",
    lost: "other",
  };
  return map[stage] ?? "lead";
}

function mapStageToLeadStatus(stage: string): string {
  const map: Record<string, string> = {
    new: "NEW",
    contacted: "ATTEMPTED_TO_CONTACT",
    replied: "IN_PROGRESS",
    meeting: "OPEN_DEAL",
    won: "CONNECTED",
    lost: "UNQUALIFIED",
  };
  return map[stage] ?? "NEW";
}
