/**
 * Google Search Data Mining
 *
 * Uses Google search to find emails, phones, social profiles, and news
 * that aren't on the company website directly.
 *
 * Uses scraping (no API key needed) with careful rate limiting.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g;

interface GoogleSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Search Google and extract results from the HTML.
 */
async function googleSearch(query: string): Promise<GoogleSearchResult[]> {
  try {
    const encoded = encodeURIComponent(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`https://www.google.com/search?q=${encoded}&num=10`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const html = await res.text();

    // Extract search results from Google's HTML
    const results: GoogleSearchResult[] = [];
    const resultPattern = new RegExp('<a href="\\/url\\?q=(https?[^&"]+).*?<h3[^>]*>(.*?)<\\/h3>.*?<span[^>]*>(.*?)<\\/span>', 'gs');

    let match;
    while ((match = resultPattern.exec(html)) !== null) {
      results.push({
        url: decodeURIComponent(match[1]),
        title: match[2].replace(/<[^>]+>/g, ""),
        snippet: match[3].replace(/<[^>]+>/g, ""),
      });
    }

    // Fallback: extract from data-surl attributes or other patterns
    if (results.length === 0) {
      const snippetBlocks = html.match(new RegExp('<div class="[^"]*"[^>]*><span[^>]*>(.*?)<\\/span>', 'gs')) ?? [];
      for (const block of snippetBlocks.slice(0, 10)) {
        const text = block.replace(/<[^>]+>/g, "");
        if (text.length > 50) {
          results.push({ title: "", url: "", snippet: text });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Search for email addresses associated with a person and company.
 */
export async function searchForEmails(
  name: string,
  company: string,
  domain?: string
): Promise<{ email: string; source: string }[]> {
  const emails: { email: string; source: string }[] = [];
  const seen = new Set<string>();

  const queries = [
    `"${name}" "${company}" email`,
    domain ? `"${name}" "@${domain}"` : null,
    `"${name}" "${company}" contact`,
  ].filter(Boolean) as string[];

  for (const query of queries) {
    const results = await googleSearch(query);

    for (const result of results) {
      const text = `${result.title} ${result.snippet}`;
      const found = text.match(EMAIL_REGEX) ?? [];

      for (const email of found) {
        const lower = email.toLowerCase();
        if (!seen.has(lower) && !lower.includes("example.com") && !lower.includes("sentry.io")) {
          seen.add(lower);
          emails.push({ email: lower, source: `Google search: "${query}"` });
        }
      }
    }

    // Rate limit between searches
    await new Promise((r) => setTimeout(r, 2000));
  }

  return emails;
}

/**
 * Search for social profiles of a company or person.
 */
export async function searchForSocialProfiles(
  company: string
): Promise<{ platform: string; url: string }[]> {
  const profiles: { platform: string; url: string }[] = [];

  const results = await googleSearch(`"${company}" site:linkedin.com/company OR site:twitter.com OR site:facebook.com`);

  for (const result of results) {
    if (result.url.includes("linkedin.com/company")) {
      profiles.push({ platform: "linkedin", url: result.url.split("?")[0] });
    } else if (result.url.includes("twitter.com") || result.url.includes("x.com")) {
      profiles.push({ platform: "twitter", url: result.url.split("?")[0] });
    } else if (result.url.includes("facebook.com")) {
      profiles.push({ platform: "facebook", url: result.url.split("?")[0] });
    }
  }

  return profiles;
}

/**
 * Search for recent news about a company.
 */
export async function searchForNews(
  company: string
): Promise<{ title: string; url: string; snippet: string }[]> {
  const results = await googleSearch(`"${company}" news OR funding OR expansion OR hiring 2026`);

  return results
    .filter((r) => r.title && r.snippet)
    .slice(0, 5)
    .map((r) => ({ title: r.title, url: r.url, snippet: r.snippet }));
}

/**
 * Search for people at a company (decision makers).
 */
export async function searchForPeople(
  company: string
): Promise<{ name: string; title: string; source: string }[]> {
  const people: { name: string; title: string; source: string }[] = [];

  const results = await googleSearch(`"${company}" CEO OR founder OR owner OR "managing director"`);

  for (const result of results) {
    const text = `${result.title} ${result.snippet}`;

    // Look for "Name, Title" or "Name is the CEO of Company"
    const patterns = [
      /([A-Z][a-z]+\s[A-Z][a-z]+),?\s(?:is\s)?(?:the\s)?(CEO|Founder|Owner|President|Director|Manager|Partner)/gi,
      /(CEO|Founder|Owner|President|Director)\s([A-Z][a-z]+\s[A-Z][a-z]+)/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1].length > match[2].length ? match[1] : match[2];
        const title = match[1].length > match[2].length ? match[2] : match[1];

        if (name.length >= 4 && name.length <= 40) {
          people.push({ name: name.trim(), title: title.trim(), source: result.url });
        }
      }
    }
  }

  // Deduplicate by name
  const seen = new Set<string>();
  return people.filter((p) => {
    const key = p.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
