/**
 * Waterfall Enrichment Engine — PARALLELIZED
 *
 * Phase 1 (parallel, ~8-10s): Decision makers + Website + Google + GitHub
 * Phase 2 (only if needed, ~8s): Pattern generation + Hunter.io
 *
 * Total: ~10-18s instead of 60-90s sequential.
 */

import { scrapeWebsiteForEmails } from "./website-scraper";
import { findDecisionMakers } from "./decision-maker-finder";
import { searchForEmails } from "./google-search";
import { scrapeGitHubProfile } from "./social-scraper";
import { generateEmailCandidates, parseFullName, guessDomain } from "./pattern-generator";
import { verifyEmail, verifyEmailBatch } from "./smtp-verifier";
import { promises as dns } from "dns";

async function getMxHost(domain: string): Promise<string | null> {
  try {
    const records = await dns.resolveMx(domain);
    if (!records.length) return null;
    records.sort((a, b) => a.priority - b.priority);
    return records[0].exchange;
  } catch { return null; }
}

export interface WaterfallEmailResult {
  email: string;
  confidence: number;
  source: string;
  verified: boolean;
  method: string;
  personName: string | null;
  personTitle: string | null;
}

export async function waterfallEmailEnrichment(params: {
  name: string;
  company: string | null;
  domain: string | null;
}): Promise<WaterfallEmailResult[]> {
  const results: WaterfallEmailResult[] = [];
  const seenEmails = new Set<string>();

  const add = (r: WaterfallEmailResult) => {
    const key = r.email.toLowerCase();
    if (!seenEmails.has(key)) {
      seenEmails.add(key);
      results.push(r);
    }
  };

  // Determine domain
  const domains: string[] = [];
  if (params.domain) {
    domains.push(params.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]);
  }
  if (domains.length === 0 && params.company) {
    domains.push(...guessDomain(params.company).slice(0, 2));
  }
  const domain = domains[0];

  // ══════════════════════════════════════════
  // PHASE 1: Run all discovery sources in PARALLEL (~8-10s)
  // ══════════════════════════════════════════

  const phase1Promises: Promise<void>[] = [];

  // Source 1: Decision makers (team pages — all pages fetched in parallel internally)
  if (domain) {
    phase1Promises.push(
      findDecisionMakers(domain).then((dms) => {
        for (const dm of dms) {
          if (dm.email) {
            add({
              email: dm.email,
              confidence: dm.emailConfidence,
              source: "decision-maker",
              verified: dm.emailVerified,
              method: `Team page: ${dm.name} (${dm.title})`,
              personName: dm.name,
              personTitle: dm.title,
            });
          }
        }
      }).catch(() => {})
    );
  }

  // Source 2: Website emails (all pages fetched in parallel internally)
  if (domain) {
    phase1Promises.push(
      scrapeWebsiteForEmails(domain).then(async (scraped) => {
        // Verify non-generic emails in parallel
        const personalEmails = scraped.filter((s) => !s.isGeneric).slice(0, 5);
        const verifications = await Promise.allSettled(
          personalEmails.map(async (s) => {
            const v = await verifyEmail(s.email);
            return { ...s, verified: v };
          })
        );
        for (const r of verifications) {
          if (r.status !== "fulfilled") continue;
          const { email, source, verified } = r.value;
          add({
            email,
            confidence: verified.exists === true ? 95 : verified.mxHost ? 70 : 50,
            source: "website-scrape",
            verified: verified.exists === true,
            method: `Found on ${source}`,
            personName: null,
            personTitle: null,
          });
        }
      }).catch(() => {})
    );
  }

  // Source 3: Google search (all queries in parallel internally)
  if (params.company) {
    phase1Promises.push(
      searchForEmails(params.name, params.company, domain).then(async (googleEmails) => {
        // Verify top results in parallel
        const verifications = await Promise.allSettled(
          googleEmails.slice(0, 3).map(async (ge) => {
            const v = await verifyEmail(ge.email);
            return { ...ge, verified: v };
          })
        );
        for (const r of verifications) {
          if (r.status !== "fulfilled") continue;
          const { email, source, verified } = r.value;
          add({
            email,
            confidence: verified.exists === true ? 90 : verified.mxHost ? 60 : 45,
            source: "google-search",
            verified: verified.exists === true,
            method: source,
            personName: params.name,
            personTitle: null,
          });
        }
      }).catch(() => {})
    );
  }

  // Source 4: GitHub
  if (params.name && params.company) {
    phase1Promises.push(
      scrapeGitHubProfile(params.name, params.company).then(async (githubEmails) => {
        const verifications = await Promise.allSettled(
          githubEmails.slice(0, 2).map(async (email) => {
            const v = await verifyEmail(email);
            return { email, verified: v };
          })
        );
        for (const r of verifications) {
          if (r.status !== "fulfilled") continue;
          add({
            email: r.value.email,
            confidence: r.value.verified.exists === true ? 88 : 55,
            source: "github",
            verified: r.value.verified.exists === true,
            method: "GitHub public profile/commits",
            personName: params.name,
            personTitle: null,
          });
        }
      }).catch(() => {})
    );
  }

  // Wait for ALL phase 1 sources to complete
  await Promise.allSettled(phase1Promises);

  // Check if we already have a verified email — if so, skip phase 2
  const hasVerifiedEmail = results.some((r) => r.verified && r.confidence >= 85);

  // ══════════════════════════════════════════
  // PHASE 2: Pattern generation (only if no verified email found)
  // ══════════════════════════════════════════

  if (!hasVerifiedEmail) {
    const parsed = parseFullName(params.name);

    // Pattern generation + Hunter in parallel
    const phase2Promises: Promise<void>[] = [];

    if (parsed && parsed.lastName && domain) {
      phase2Promises.push(
        (async () => {
          try {
            const candidates = generateEmailCandidates(parsed.firstName, parsed.lastName, domain);
            const verified = await verifyEmailBatch(candidates.slice(0, 6));

            for (const v of verified) {
              if (v.exists === true) {
                add({
                  email: v.email, confidence: 90,
                  source: "pattern-verified", verified: true,
                  method: `Pattern "${v.pattern}" verified`,
                  personName: params.name, personTitle: null,
                });
              } else if (v.exists === null && v.isCatchAll) {
                add({
                  email: v.email, confidence: 50,
                  source: "pattern-catchall", verified: false,
                  method: `Pattern "${v.pattern}" (catch-all domain)`,
                  personName: params.name, personTitle: null,
                });
              } else if (v.exists === null && v.mxHost) {
                const patternConfidence: Record<string, number> = {
                  "first.last": 75, "first": 70, "firstlast": 65,
                  "flast": 60, "first_last": 55, "first-last": 55,
                };
                add({
                  email: v.email, confidence: patternConfidence[v.pattern] ?? 45,
                  source: "pattern-likely", verified: false,
                  method: `Pattern "${v.pattern}" (MX valid)`,
                  personName: params.name, personTitle: null,
                });
              }
            }
          } catch {
            // Fallback: add top patterns with MX check
            const candidates = generateEmailCandidates(parsed!.firstName, parsed!.lastName, domain!);
            const mxHost = await getMxHost(domain!).catch(() => null);
            for (const c of candidates.slice(0, 3)) {
              add({
                email: c.email, confidence: mxHost ? 60 : 30,
                source: mxHost ? "pattern-likely" : "pattern-unverified",
                verified: false,
                method: mxHost ? `Pattern "${c.pattern}" (MX: ${mxHost})` : `Pattern "${c.pattern}"`,
                personName: params.name, personTitle: null,
              });
            }
          }
        })()
      );
    }

    // Hunter.io (in parallel with patterns)
    if (process.env.HUNTER_API_KEY && parsed && parsed.lastName && domain) {
      phase2Promises.push(
        (async () => {
          try {
            const hunterRes = await fetch(
              `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${parsed!.firstName}&last_name=${parsed!.lastName}&api_key=${process.env.HUNTER_API_KEY}`,
              { signal: AbortSignal.timeout(8000) }
            );
            if (hunterRes.ok) {
              const data = await hunterRes.json();
              if (data.data?.email) {
                add({
                  email: data.data.email,
                  confidence: data.data.confidence ?? 70,
                  source: "hunter",
                  verified: data.data.confidence >= 90,
                  method: `Hunter.io (${data.data.confidence ?? "?"}% confidence)`,
                  personName: params.name, personTitle: null,
                });
              }
            }
          } catch {}
        })()
      );
    }

    await Promise.allSettled(phase2Promises);
  }

  // Sort: decision makers first, then verified, then by confidence
  return results.sort((a, b) => {
    if (a.personTitle && !b.personTitle) return -1;
    if (!a.personTitle && b.personTitle) return 1;
    if (a.verified && !b.verified) return -1;
    if (!a.verified && b.verified) return 1;
    return b.confidence - a.confidence;
  });
}
