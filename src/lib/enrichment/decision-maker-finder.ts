/**
 * Decision Maker Finder
 *
 * Scrapes company websites to identify decision makers (CEO, Owner, Founder, etc.)
 * and find their direct contact info.
 *
 * OPTIMIZED: All team pages fetched in parallel (8s instead of 88s).
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
 * Fetch a single page and extract people from it.
 */
async function fetchAndExtractPeople(
  url: string
): Promise<{ name: string; title: string; email: string | null }[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScrapedBot/1.0)", Accept: "text/html" },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const html = await res.text();
    const people: { name: string; title: string; email: string | null }[] = [];
    const seenNames = new Set<string>();

    // Regex patterns for "Name, Title"
    const nameTitlePatterns = [
      /([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})\s*[,\-–—|]\s*((?:Chief|CEO|CTO|COO|CMO|CFO|VP|Vice|President|Director|Manager|Owner|Founder|Co-Founder|Partner|Principal|Head|General|Managing)[^<\n]{0,40})/gi,
      /<(?:h[2-6]|strong|b)[^>]*>([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})<\/(?:h[2-6]|strong|b)>\s*<(?:p|span|div)[^>]*>((?:Chief|CEO|CTO|COO|CMO|CFO|VP|Vice|President|Director|Manager|Owner|Founder|Co-Founder|Partner|Principal|Head|General|Managing)[^<]{0,60})/gi,
    ];

    for (const pattern of nameTitlePatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const name = match[1].trim();
        const title = match[2].trim().replace(/<[^>]+>/g, "").trim();
        if (name.length < 4 || name.length > 50) continue;
        if (seenNames.has(name.toLowerCase())) continue;
        const titleLower = title.toLowerCase();
        if (!DECISION_MAKER_TITLES.some((t) => titleLower.includes(t))) continue;

        seenNames.add(name.toLowerCase());
        const nameIndex = html.indexOf(name);
        const nearbyHtml = html.slice(Math.max(0, nameIndex - 200), nameIndex + 500);
        const emailMatch = nearbyHtml.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);

        people.push({ name, title, email: emailMatch?.[0] ?? null });
      }
    }

    // JSON-LD
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
              if (DECISION_MAKER_TITLES.some((t) => titleLower.includes(t)) && !seenNames.has(item.name.toLowerCase())) {
                seenNames.add(item.name.toLowerCase());
                people.push({ name: item.name, title: item.jobTitle, email: item.email ?? null });
              }
            }
          }
        } catch {}
      }
    }

    return people;
  } catch {
    return [];
  }
}

/**
 * Scrape ALL team pages in parallel, then deduplicate people.
 */
async function scrapeTeamPages(domain: string): Promise<{ name: string; title: string; email: string | null }[]> {
  // Fetch ALL pages in parallel — one 6s round trip instead of 11 sequential
  const results = await Promise.allSettled(
    TEAM_PAGES.map((path) => fetchAndExtractPeople(`https://${domain}${path}`))
  );

  const allPeople: { name: string; title: string; email: string | null }[] = [];
  const seenNames = new Set<string>();

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const person of result.value) {
      if (!seenNames.has(person.name.toLowerCase())) {
        seenNames.add(person.name.toLowerCase());
        allPeople.push(person);
      }
    }
  }

  return allPeople;
}

/**
 * Try role-based email patterns (ceo@domain, owner@domain, etc.)
 */
async function tryRoleEmails(domain: string): Promise<DecisionMaker[]> {
  const candidates = ROLE_EMAIL_PATTERNS.map((role) => ({
    email: `${role}@${domain}`,
    pattern: role,
  }));

  const verified = await verifyEmailBatch(candidates);
  const results: DecisionMaker[] = [];

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
 * Find decision makers. Parallelized for speed.
 */
export async function findDecisionMakers(domain: string): Promise<DecisionMaker[]> {
  const results: DecisionMaker[] = [];

  // Step 1: Scrape team pages (all in parallel)
  const people = await scrapeTeamPages(domain);

  // Step 2: For each person, resolve their email (in parallel)
  const emailPromises = people.map(async (person) => {
    if (person.email) {
      const verification = await verifyEmail(person.email);
      return {
        name: person.name,
        title: person.title,
        email: person.email,
        emailConfidence: verification.exists === true ? 95 : 60,
        emailVerified: verification.exists === true,
        source: "team-page",
      } as DecisionMaker;
    }

    const parsed = parseFullName(person.name);
    if (parsed && parsed.lastName) {
      const candidates = generateEmailCandidates(parsed.firstName, parsed.lastName, domain);
      const verified = await verifyEmailBatch(candidates.slice(0, 4));
      const best = verified.find((v) => v.exists === true);

      if (best) {
        return {
          name: person.name, title: person.title,
          email: best.email, emailConfidence: 90, emailVerified: true,
          source: "team-page-pattern",
        } as DecisionMaker;
      }

      // Use most likely pattern with MX-based confidence
      const hasMx = verified.some((v) => v.mxHost);
      return {
        name: person.name, title: person.title,
        email: candidates[0].email,
        emailConfidence: hasMx ? 65 : 40,
        emailVerified: false,
        source: hasMx ? "team-page-pattern-likely" : "team-page-pattern-unverified",
      } as DecisionMaker;
    }

    return null;
  });

  const resolved = await Promise.allSettled(emailPromises);
  for (const r of resolved) {
    if (r.status === "fulfilled" && r.value) results.push(r.value);
  }

  // Step 3: Role-based patterns if not enough verified
  if (results.filter((r) => r.emailVerified).length < 2) {
    const roleResults = await tryRoleEmails(domain);
    for (const r of roleResults) {
      if (!results.some((e) => e.email === r.email)) results.push(r);
    }
  }

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
  if (lower.includes("cto") || lower.includes("coo") || lower.includes("cmo")) return 6;
  if (lower.includes("vp") || lower.includes("vice president")) return 7;
  if (lower.includes("director")) return 8;
  if (lower.includes("head of")) return 9;
  if (lower.includes("manager")) return 10;
  return 20;
}
