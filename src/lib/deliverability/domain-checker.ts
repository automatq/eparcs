/**
 * Domain Authentication Checker
 *
 * Verifies SPF, DKIM, and DMARC records for sending domains.
 */

import dns from "dns/promises";

interface DomainAuthResult {
  domain: string;
  spf: { valid: boolean; record?: string };
  dkim: { valid: boolean; record?: string };
  dmarc: { valid: boolean; record?: string; policy?: string };
  overall: "pass" | "partial" | "fail";
  recommendations: string[];
}

export async function checkDomainAuth(domain: string): Promise<DomainAuthResult> {
  const recommendations: string[] = [];

  // Check SPF
  let spf = { valid: false, record: undefined as string | undefined };
  try {
    const txtRecords = await dns.resolveTxt(domain);
    const spfRecord = txtRecords.flat().find((r) => r.startsWith("v=spf1"));
    if (spfRecord) {
      spf = { valid: true, record: spfRecord };
    } else {
      recommendations.push("Add an SPF record to authorize your sending servers");
    }
  } catch {
    recommendations.push("Add an SPF record to your DNS");
  }

  // Check DKIM (common selectors)
  let dkim = { valid: false, record: undefined as string | undefined };
  const dkimSelectors = ["google", "default", "selector1", "selector2", "k1"];
  for (const selector of dkimSelectors) {
    try {
      const records = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
      const dkimRecord = records.flat().join("");
      if (dkimRecord.includes("v=DKIM1")) {
        dkim = { valid: true, record: `${selector}._domainkey` };
        break;
      }
    } catch {}
  }
  if (!dkim.valid) {
    recommendations.push("Set up DKIM signing for your domain");
  }

  // Check DMARC
  let dmarc = { valid: false, record: undefined as string | undefined, policy: undefined as string | undefined };
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = records.flat().find((r) => r.startsWith("v=DMARC1"));
    if (dmarcRecord) {
      const policyMatch = dmarcRecord.match(/p=(\w+)/);
      dmarc = {
        valid: true,
        record: dmarcRecord,
        policy: policyMatch?.[1],
      };
    } else {
      recommendations.push("Add a DMARC record for email authentication");
    }
  } catch {
    recommendations.push("Add a DMARC record to your DNS");
  }

  const validCount = [spf.valid, dkim.valid, dmarc.valid].filter(Boolean).length;
  const overall = validCount === 3 ? "pass" : validCount >= 1 ? "partial" : "fail";

  return { domain, spf, dkim, dmarc, overall, recommendations };
}
