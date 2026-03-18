/**
 * Website Email Scraper
 *
 * OPTIMIZED: All 9 pages fetched in parallel (one 6s round trip).
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const IGNORE_PATTERNS = [
  /^(info|hello|contact|support|admin|noreply|no-reply|sales|help|team|press|media|privacy|abuse|webmaster|postmaster|hostmaster)@/i,
  /example\.com$/i, /sentry\.io$/i, /gmail\.com$/i, /hotmail\.com$/i, /yahoo\.com$/i, /outlook\.com$/i,
];

const PAGES_TO_CHECK = [
  "", "/contact", "/contact-us", "/about", "/about-us",
  "/team", "/our-team", "/people", "/leadership",
];

export interface ScrapedEmail {
  email: string;
  source: string;
  isGeneric: boolean;
}

async function scrapePageForEmails(url: string): Promise<ScrapedEmail[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScrapedBot/1.0)", Accept: "text/html" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!response.ok) return [];

    const html = await response.text();
    const emails = new Set<string>();
    (html.match(EMAIL_REGEX) ?? []).forEach((e) => emails.add(e.toLowerCase()));

    const obfuscated = html.match(/[a-zA-Z0-9._%+\-]+\s*[\[({]\s*at\s*[\])}]\s*[a-zA-Z0-9.\-]+\s*[\[({]\s*dot\s*[\])}]\s*[a-zA-Z]{2,}/gi);
    if (obfuscated) {
      obfuscated.forEach((m) => {
        emails.add(m.replace(/\s*[\[({]\s*at\s*[\])}]\s*/gi, "@").replace(/\s*[\[({]\s*dot\s*[\])}]\s*/gi, ".").toLowerCase());
      });
    }

    return Array.from(emails).map((email) => ({
      email, source: url,
      isGeneric: IGNORE_PATTERNS.some((p) => p.test(email)),
    }));
  } catch { return []; }
}

/**
 * Scrape all pages in parallel. One 6s round trip.
 */
export async function scrapeWebsiteForEmails(domain: string): Promise<ScrapedEmail[]> {
  const baseUrl = `https://${domain}`;
  const allEmails = new Map<string, ScrapedEmail>();

  // ALL pages in parallel — not batched
  const results = await Promise.allSettled(
    PAGES_TO_CHECK.map((path) => scrapePageForEmails(`${baseUrl}${path}`))
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const scraped of result.value) {
      if (scraped.email.endsWith(`@${domain}`) && !allEmails.has(scraped.email)) {
        allEmails.set(scraped.email, scraped);
      }
    }
  }

  return Array.from(allEmails.values()).sort((a, b) => (a.isGeneric === b.isGeneric ? 0 : a.isGeneric ? 1 : -1));
}
