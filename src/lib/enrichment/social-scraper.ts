/**
 * Social Profile Scraper
 *
 * Scrapes public social profiles for contact info and company data.
 * No login required — uses public pages only.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

export interface SocialData {
  platform: string;
  url: string;
  emails: string[];
  phones: string[];
  description: string | null;
  employeeCount: number | null;
  website: string | null;
}

async function fetchPage(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return "";
    return res.text();
  } catch {
    return "";
  }
}

/**
 * Scrape a Twitter/X profile for contact info.
 */
export async function scrapeTwitterProfile(url: string): Promise<SocialData> {
  const result: SocialData = {
    platform: "twitter",
    url,
    emails: [],
    phones: [],
    description: null,
    employeeCount: null,
    website: null,
  };

  // Twitter blocks scraping heavily — use nitter mirror or basic fetch
  const html = await fetchPage(url);
  if (!html) return result;

  // Extract emails from the page
  const emails = html.match(EMAIL_REGEX) ?? [];
  result.emails = [...new Set(emails.map((e) => e.toLowerCase()))];

  // Extract bio/description
  const bioMatch = html.match(/content="([^"]{20,200})"\s+property="og:description"/);
  if (bioMatch) result.description = bioMatch[1];

  // Extract website from bio
  const websiteMatch = html.match(/href="(https?:\/\/t\.co\/[^"]+)"[^>]*>([^<]+\.(?:com|io|co|ca|net|org))/i);
  if (websiteMatch) result.website = websiteMatch[2];

  return result;
}

/**
 * Scrape a GitHub profile/org for email addresses.
 */
export async function scrapeGitHubProfile(name: string, company: string): Promise<string[]> {
  const emails: string[] = [];

  try {
    // Search GitHub users API (no auth needed for basic search)
    const query = encodeURIComponent(`${name} ${company}`);
    const res = await fetch(`https://api.github.com/search/users?q=${query}&per_page=3`, {
      headers: { "User-Agent": "ScrapedBot/1.0" },
    });

    if (!res.ok) return emails;
    const data = await res.json();

    for (const user of data.items?.slice(0, 2) ?? []) {
      // Fetch user profile for email
      const profileRes = await fetch(`https://api.github.com/users/${user.login}`, {
        headers: { "User-Agent": "ScrapedBot/1.0" },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        if (profile.email) {
          emails.push(profile.email.toLowerCase());
        }
      }

      // Check recent public events for email in commits
      const eventsRes = await fetch(`https://api.github.com/users/${user.login}/events/public?per_page=10`, {
        headers: { "User-Agent": "ScrapedBot/1.0" },
      });
      if (eventsRes.ok) {
        const events = await eventsRes.json();
        for (const event of events) {
          if (event.type === "PushEvent") {
            for (const commit of event.payload?.commits ?? []) {
              const email = commit.author?.email;
              if (email && !email.includes("noreply") && !email.includes("users.noreply")) {
                emails.push(email.toLowerCase());
              }
            }
          }
        }
      }

      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch { /* GitHub API failed */ }

  return [...new Set(emails)];
}

/**
 * Scrape a Facebook business page for contact info.
 */
export async function scrapeFacebookPage(url: string): Promise<SocialData> {
  const result: SocialData = {
    platform: "facebook",
    url,
    emails: [],
    phones: [],
    description: null,
    employeeCount: null,
    website: null,
  };

  const html = await fetchPage(url);
  if (!html) return result;

  // Extract emails
  const emails = html.match(EMAIL_REGEX) ?? [];
  result.emails = [...new Set(emails.map((e) => e.toLowerCase()))];

  // Extract phone
  const phoneMatch = html.match(/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/);
  if (phoneMatch) result.phones.push(phoneMatch[0]);

  // Extract description
  const descMatch = html.match(/content="([^"]{20,300})"\s+property="og:description"/);
  if (descMatch) result.description = descMatch[1];

  return result;
}

/**
 * Estimate employee count from a LinkedIn company page URL.
 * LinkedIn blocks scraping but we can get some data from the public page.
 */
export async function scrapeLinkedInCompanySize(url: string): Promise<{
  employeeCount: number | null;
  employeeRange: string | null;
  industry: string | null;
  description: string | null;
}> {
  const html = await fetchPage(url);
  if (!html) return { employeeCount: null, employeeRange: null, industry: null, description: null };

  // Try to extract from meta tags or structured data
  let employeeCount: number | null = null;
  let employeeRange: string | null = null;
  let industry: string | null = null;
  let description: string | null = null;

  // Employee count from various patterns
  const empMatch = html.match(/(\d[\d,]+)\s*(?:employees|team members|staff)/i);
  if (empMatch) {
    employeeCount = parseInt(empMatch[1].replace(/,/g, ""));
    employeeRange = getEmployeeRange(employeeCount);
  }

  // Industry from meta
  const industryMatch = html.match(/industry[^>]*>([^<]+)</i);
  if (industryMatch) industry = industryMatch[1].trim();

  // Description from og:description
  const descMatch = html.match(/content="([^"]{20,300})"\s+property="og:description"/);
  if (descMatch) description = descMatch[1];

  return { employeeCount, employeeRange, industry, description };
}

function getEmployeeRange(count: number): string {
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  if (count <= 200) return "51-200";
  if (count <= 500) return "201-500";
  if (count <= 1000) return "501-1000";
  return "1001+";
}
