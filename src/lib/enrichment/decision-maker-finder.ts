/**
 * Decision Maker Finder
 *
 * Scrapes company websites to identify decision makers (CEO, Owner, Founder, etc.)
 * and find their direct contact info.
 *
 * Methods:
 * 1. Scrape team/about/leadership pages for name + title pairs
 * 2. Try role-based email patterns (ceo@, owner@, founder@)
 * 3. For each person found, generate + verify their personal email patterns
 */

import { generateEmailCandidates, parseFullName } from "./pattern-generator";
import { verifyEmail, verifyEmailBatch } from "./smtp-verifier";

export interface DecisionMaker {
  name: string;
  title: string;
  email: string | null;
  emailConfidence: number;
  emailVerified: boolean;
  source: string;
}

// Titles ranked by decision-making authority
const DECISION_MAKER_TITLES = [
  "owner", "founder", "co-founder", "cofounder",
  "ceo", "chief executive",
  "president",
  "managing director", "md",
  "general manager", "gm",
  "cto", "chief technology",
  "coo", "chief operating",
  "cmo", "chief marketing",
  "vp", "vice president",
  "director",
  "head of",
  "manager",
  "partner",
  "principal",
];

// Role-based email patterns to try via SMTP (no name needed)
const ROLE_EMAIL_PATTERNS = [
  "owner", "founder", "ceo", "president",
  "director", "manager", "admin",
  "hello", "info", "contact",
];

const TEAM_PAGES = [
  "/team", "/our-team", "/about", "/about-us",
  "/leadership", "/people", "/staff", "/executives",
  "/management", "/who-we-are", "/meet-the-team",
];

/**
 * Scrape a website for decision maker names and titles.
 */
async function scrapeTeamPages(domain: string): Promise<{ name: string; title: string; email: string | null }[]> {
  const people: { name: string; title: string; email: string | null }[] = [];
  const seenNames = new Set<string>();

  for (const path of TEAM_PAGES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`https://${domain}${path}`, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ScrapedBot/1.0)", Accept: "text/html" },
        redirect: "follow",
      });
      clearTimeout(timeout);

      if (!res.ok) continue;
      const html = await res.text();

      // Method 1: Look for structured patterns — "Name, Title" or "Name - Title"
      const nameTitlePatterns = [
        // "John Smith, CEO" or "John Smith — Owner"
        /([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})\s*[,\-–—|]\s*((?:Chief|CEO|CTO|COO|CMO|CFO|VP|Vice|President|Director|Manager|Owner|Founder|Co-Founder|Partner|Principal|Head|General|Managing)[^<\n]{0,40})/gi,
        // "<h3>John Smith</h3><p>CEO</p>" pattern
        /<(?:h[2-6]|strong|b)[^>]*>([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})<\/(?:h[2-6]|strong|b)>\s*<(?:p|span|div)[^>]*>((?:Chief|CEO|CTO|COO|CMO|CFO|VP|Vice|President|Director|Manager|Owner|Founder|Co-Founder|Partner|Principal|Head|General|Managing)[^<]{0,60})/gi,
      ];

      for (const pattern of nameTitlePatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const name = match[1].trim();
          const title = match[2].trim().replace(/<[^>]+>/g, "").trim();

          if (name.length < 4 || name.length > 50) continue;
          if (seenNames.has(name.toLowerCase())) continue;

          // Check if title matches decision maker keywords
          const titleLower = title.toLowerCase();
          const isDecisionMaker = DECISION_MAKER_TITLES.some((t) => titleLower.includes(t));
          if (!isDecisionMaker) continue;

          seenNames.add(name.toLowerCase());

          // Check if there's an email near this person's name in the HTML
          const nameIndex = html.indexOf(name);
          const nearbyHtml = html.slice(Math.max(0, nameIndex - 200), nameIndex + 500);
          const emailMatch = nearbyHtml.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
          const email = emailMatch?.[0] ?? null;

          people.push({ name, title, email });
        }
      }

      // Method 2: Look for JSON-LD structured data (schema.org Person)
      const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
      if (jsonLdMatches) {
        for (const jsonLd of jsonLdMatches) {
          try {
            const content = jsonLd.replace(/<\/?script[^>]*>/gi, "");
            const data = JSON.parse(content);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if (item["@type"] === "Person" && item.name && item.jobTitle) {
                const titleLower = item.jobTitle.toLowerCase();
                const isDecisionMaker = DECISION_MAKER_TITLES.some((t) => titleLower.includes(t));
                if (isDecisionMaker && !seenNames.has(item.name.toLowerCase())) {
                  seenNames.add(item.name.toLowerCase());
                  people.push({
                    name: item.name,
                    title: item.jobTitle,
                    email: item.email ?? null,
                  });
                }
              }
            }
          } catch { /* invalid JSON-LD */ }
        }
      }

      // If we found people, no need to keep scraping more pages
      if (people.length >= 3) break;
    } catch { /* page failed, continue */ }
  }

  return people;
}

/**
 * Try role-based email patterns (ceo@domain, owner@domain, etc.)
 * These work even without knowing a specific person's name.
 */
async function tryRoleEmails(domain: string): Promise<DecisionMaker[]> {
  const results: DecisionMaker[] = [];

  const candidates = ROLE_EMAIL_PATTERNS.map((role) => ({
    email: `${role}@${domain}`,
    pattern: role,
  }));

  const verified = await verifyEmailBatch(candidates);

  for (const result of verified) {
    if (result.exists === true) {
      results.push({
        name: result.pattern,
        title: result.pattern === "owner" ? "Owner"
          : result.pattern === "founder" ? "Founder"
          : result.pattern === "ceo" ? "CEO"
          : result.pattern === "president" ? "President"
          : result.pattern === "director" ? "Director"
          : result.pattern === "manager" ? "Manager"
          : "General",
        email: result.email,
        emailConfidence: result.isCatchAll ? 50 : 85,
        emailVerified: !result.isCatchAll,
        source: "role-pattern",
      });
    }
  }

  return results;
}

/**
 * Find decision makers for a company.
 * Returns people with their verified emails, ranked by authority.
 */
export async function findDecisionMakers(domain: string): Promise<DecisionMaker[]> {
  const results: DecisionMaker[] = [];

  // Step 1: Scrape team pages for named people
  const people = await scrapeTeamPages(domain);

  // Step 2: For each person found, try to find their email
  for (const person of people) {
    if (person.email) {
      // They had an email on the page — verify it
      const verification = await verifyEmail(person.email);
      results.push({
        name: person.name,
        title: person.title,
        email: person.email,
        emailConfidence: verification.exists === true ? 95 : 60,
        emailVerified: verification.exists === true,
        source: "team-page",
      });
    } else {
      // Generate email patterns from their name
      const parsed = parseFullName(person.name);
      if (parsed && parsed.lastName) {
        const candidates = generateEmailCandidates(parsed.firstName, parsed.lastName, domain);
        const verified = await verifyEmailBatch(candidates.slice(0, 6)); // Top 6 patterns

        const best = verified.find((v) => v.exists === true);
        if (best) {
          results.push({
            name: person.name,
            title: person.title,
            email: best.email,
            emailConfidence: 90,
            emailVerified: true,
            source: "team-page-pattern",
          });
        } else {
          // Use the most likely pattern even unverified
          results.push({
            name: person.name,
            title: person.title,
            email: candidates[0].email, // first.last@ is most common
            emailConfidence: 40,
            emailVerified: false,
            source: "team-page-pattern-unverified",
          });
        }
      }
    }
  }

  // Step 3: Try role-based patterns if we didn't find enough people
  if (results.filter((r) => r.emailVerified).length < 2) {
    const roleResults = await tryRoleEmails(domain);
    for (const r of roleResults) {
      // Don't add if we already have this email
      if (!results.some((existing) => existing.email === r.email)) {
        results.push(r);
      }
    }
  }

  // Sort by title authority (owner/CEO first)
  return results.sort((a, b) => {
    const aRank = getAuthorityRank(a.title);
    const bRank = getAuthorityRank(b.title);
    if (aRank !== bRank) return aRank - bRank;
    return b.emailConfidence - a.emailConfidence;
  });
}

function getAuthorityRank(title: string): number {
  const lower = title.toLowerCase();
  if (lower.includes("owner") || lower.includes("founder")) return 1;
  if (lower.includes("ceo") || lower.includes("chief executive")) return 2;
  if (lower.includes("president")) return 3;
  if (lower.includes("managing director")) return 4;
  if (lower.includes("general manager")) return 5;
  if (lower.includes("cto") || lower.includes("coo") || lower.includes("cmo")) return 6;
  if (lower.includes("vp") || lower.includes("vice president")) return 7;
  if (lower.includes("director")) return 8;
  if (lower.includes("head of")) return 9;
  if (lower.includes("manager")) return 10;
  return 20;
}
