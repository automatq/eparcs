/**
 * Scrape a company's website for email addresses.
 * Checks common pages: homepage, contact, about, team.
 * Extracts emails using regex pattern matching.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Emails to ignore (generic/noreply)
const IGNORE_PATTERNS = [
  /^(info|hello|contact|support|admin|noreply|no-reply|sales|help|team|press|media|privacy|abuse|webmaster|postmaster|hostmaster)@/i,
  /example\.com$/i,
  /sentry\.io$/i,
  /gmail\.com$/i,
  /hotmail\.com$/i,
  /yahoo\.com$/i,
  /outlook\.com$/i,
];

const PAGES_TO_CHECK = [
  "",              // homepage
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/team",
  "/our-team",
  "/people",
  "/leadership",
];

export interface ScrapedEmail {
  email: string;
  source: string;
  isGeneric: boolean;
}

/**
 * Fetch a page and extract all email addresses from it.
 */
async function scrapePageForEmails(
  url: string
): Promise<ScrapedEmail[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ScrapedBot/1.0)",
        Accept: "text/html",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!response.ok) return [];

    const html = await response.text();

    // Extract emails from HTML (including mailto: links)
    const emails = new Set<string>();

    // Standard email regex on the HTML
    const matches = html.match(EMAIL_REGEX) ?? [];
    matches.forEach((email) => emails.add(email.toLowerCase()));

    // Also check for obfuscated emails (common patterns)
    // e.g., "john [at] company [dot] com"
    const obfuscated = html.match(
      /[a-zA-Z0-9._%+\-]+\s*[\[({]\s*at\s*[\])}]\s*[a-zA-Z0-9.\-]+\s*[\[({]\s*dot\s*[\])}]\s*[a-zA-Z]{2,}/gi
    );
    if (obfuscated) {
      obfuscated.forEach((match) => {
        const cleaned = match
          .replace(/\s*[\[({]\s*at\s*[\])}]\s*/gi, "@")
          .replace(/\s*[\[({]\s*dot\s*[\])}]\s*/gi, ".")
          .toLowerCase();
        emails.add(cleaned);
      });
    }

    return Array.from(emails).map((email) => ({
      email,
      source: url,
      isGeneric: IGNORE_PATTERNS.some((pattern) => pattern.test(email)),
    }));
  } catch {
    return [];
  }
}

/**
 * Scrape a domain's website for email addresses.
 * Checks common pages (contact, about, team, etc.)
 * Returns personal emails first, then generic ones.
 */
export async function scrapeWebsiteForEmails(
  domain: string
): Promise<ScrapedEmail[]> {
  const baseUrl = `https://${domain}`;
  const allEmails = new Map<string, ScrapedEmail>();

  // Scrape pages in parallel (max 4 concurrent)
  const batchSize = 4;
  for (let i = 0; i < PAGES_TO_CHECK.length; i += batchSize) {
    const batch = PAGES_TO_CHECK.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((path) => scrapePageForEmails(`${baseUrl}${path}`))
    );

    results.flat().forEach((scraped) => {
      // Only keep emails from this domain (or closely related)
      if (scraped.email.endsWith(`@${domain}`)) {
        if (!allEmails.has(scraped.email)) {
          allEmails.set(scraped.email, scraped);
        }
      }
    });
  }

  // Sort: personal emails first, generic last
  return Array.from(allEmails.values()).sort((a, b) => {
    if (a.isGeneric === b.isGeneric) return 0;
    return a.isGeneric ? 1 : -1;
  });
}
