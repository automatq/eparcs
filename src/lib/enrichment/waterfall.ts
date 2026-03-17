/**
 * Waterfall Enrichment Engine
 *
 * Chains multiple data sources sequentially for email discovery.
 * Like Clay's approach: try source A, if no result try B, then C, etc.
 * Stops as soon as a high-confidence verified email is found.
 *
 * Sources (in order):
 * 1. Decision maker finder (team pages)
 * 2. Website email scraping
 * 3. Google search dorking
 * 4. GitHub profile search
 * 5. Pattern generation + SMTP verification
 * 6. Role-based email patterns (ceo@, owner@)
 * 7. Hunter.io (if configured)
 */

import { scrapeWebsiteForEmails } from "./website-scraper";
import { findDecisionMakers } from "./decision-maker-finder";
import { searchForEmails } from "./google-search";
import { scrapeGitHubProfile } from "./social-scraper";
import {
  generateEmailCandidates,
  parseFullName,
  guessDomain,
} from "./pattern-generator";
import { verifyEmail, verifyEmailBatch } from "./smtp-verifier";

export interface WaterfallEmailResult {
  email: string;
  confidence: number;
  source: string;
  verified: boolean;
  method: string;
  personName: string | null;
  personTitle: string | null;
}

/**
 * Run the full email waterfall for a lead.
 * Returns ALL found emails, sorted by confidence.
 */
export async function waterfallEmailEnrichment(params: {
  name: string;
  company: string | null;
  domain: string | null;
}): Promise<WaterfallEmailResult[]> {
  const results: WaterfallEmailResult[] = [];
  const seenEmails = new Set<string>();
  let hasVerifiedEmail = false;

  const add = (r: WaterfallEmailResult) => {
    const key = r.email.toLowerCase();
    if (!seenEmails.has(key)) {
      seenEmails.add(key);
      results.push(r);
      if (r.verified && r.confidence >= 85) hasVerifiedEmail = true;
    }
  };

  // Determine domains
  const domains: string[] = [];
  if (params.domain) {
    domains.push(params.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]);
  }
  if (domains.length === 0 && params.company) {
    domains.push(...guessDomain(params.company).slice(0, 2));
  }

  const domain = domains[0];

  // ── Source 1: Decision Maker Finder (team pages) ──
  if (domain) {
    try {
      const dms = await findDecisionMakers(domain);
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
    } catch { /* continue */ }
  }

  // ── Source 2: Website email scraping ──
  if (domain && !hasVerifiedEmail) {
    try {
      const scraped = await scrapeWebsiteForEmails(domain);
      for (const s of scraped) {
        if (!s.isGeneric) {
          const v = await verifyEmail(s.email);
          add({
            email: s.email,
            confidence: v.exists === true ? 95 : 65,
            source: "website-scrape",
            verified: v.exists === true,
            method: `Found on ${s.source}`,
            personName: null,
            personTitle: null,
          });
        }
      }
    } catch { /* continue */ }
  }

  // ── Source 3: Google search dorking ──
  if (params.company && !hasVerifiedEmail) {
    try {
      const googleEmails = await searchForEmails(
        params.name,
        params.company,
        domain
      );
      for (const ge of googleEmails.slice(0, 5)) {
        const v = await verifyEmail(ge.email);
        add({
          email: ge.email,
          confidence: v.exists === true ? 90 : 50,
          source: "google-search",
          verified: v.exists === true,
          method: ge.source,
          personName: params.name,
          personTitle: null,
        });
      }
    } catch { /* continue */ }
  }

  // ── Source 4: GitHub profile search ──
  if (params.name && params.company && !hasVerifiedEmail) {
    try {
      const githubEmails = await scrapeGitHubProfile(params.name, params.company);
      for (const email of githubEmails.slice(0, 3)) {
        const v = await verifyEmail(email);
        add({
          email,
          confidence: v.exists === true ? 88 : 55,
          source: "github",
          verified: v.exists === true,
          method: `GitHub public profile/commits`,
          personName: params.name,
          personTitle: null,
        });
      }
    } catch { /* continue */ }
  }

  // ── Source 5: Pattern generation + SMTP ──
  const parsed = parseFullName(params.name);
  if (parsed && parsed.lastName && domain && !hasVerifiedEmail) {
    try {
      const candidates = generateEmailCandidates(parsed.firstName, parsed.lastName, domain);
      const verified = await verifyEmailBatch(candidates.slice(0, 8));

      for (const v of verified) {
        if (v.exists === true) {
          add({
            email: v.email,
            confidence: 90,
            source: "pattern-verified",
            verified: true,
            method: `Pattern "${v.pattern}" SMTP verified`,
            personName: params.name,
            personTitle: null,
          });
        } else if (v.exists === null && v.isCatchAll) {
          add({
            email: v.email,
            confidence: 50,
            source: "pattern-catchall",
            verified: false,
            method: `Pattern "${v.pattern}" (catch-all domain)`,
            personName: params.name,
            personTitle: null,
          });
        }
      }
    } catch {
      // Add top unverified patterns as fallback
      if (parsed && parsed.lastName && domain) {
        const candidates = generateEmailCandidates(parsed.firstName, parsed.lastName, domain);
        for (const c of candidates.slice(0, 3)) {
          add({
            email: c.email,
            confidence: 35,
            source: "pattern-unverified",
            verified: false,
            method: `Pattern "${c.pattern}" (SMTP failed)`,
            personName: params.name,
            personTitle: null,
          });
        }
      }
    }
  }

  // ── Source 6: Hunter.io fallback ──
  if (process.env.HUNTER_API_KEY && parsed && parsed.lastName && domain && !hasVerifiedEmail) {
    try {
      const hunterRes = await fetch(
        `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${parsed.firstName}&last_name=${parsed.lastName}&api_key=${process.env.HUNTER_API_KEY}`
      );
      if (hunterRes.ok) {
        const data = await hunterRes.json();
        if (data.data?.email) {
          const v = await verifyEmail(data.data.email);
          add({
            email: data.data.email,
            confidence: v.exists === true ? 95 : data.data.confidence ?? 60,
            source: "hunter",
            verified: v.exists === true,
            method: `Hunter.io (${data.data.confidence ?? "?"}% confidence)`,
            personName: params.name,
            personTitle: null,
          });
        }
      }
    } catch { /* Hunter failed */ }
  }

  // Sort: verified + high confidence first, decision makers on top
  return results.sort((a, b) => {
    if (a.personTitle && !b.personTitle) return -1;
    if (!a.personTitle && b.personTitle) return 1;
    if (a.verified && !b.verified) return -1;
    if (!a.verified && b.verified) return 1;
    return b.confidence - a.confidence;
  });
}
