/**
 * Phone Number Enrichment
 *
 * Finds phone numbers for a business by scraping their website.
 * Extracts from: contact page, footer, about page, header.
 */

export interface PhoneResult {
  phone: string;
  type: "main" | "direct" | "mobile" | "fax";
  source: string;
  personName: string | null;
}

// Phone number regex patterns (North American + international)
const PHONE_PATTERNS = [
  // (xxx) xxx-xxxx
  /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g,
  // +1 xxx xxx xxxx
  /\+1[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g,
  // xxx.xxx.xxxx
  /\d{3}\.\d{3}\.\d{4}/g,
  // International: +xx xxxx xxxxxxx
  /\+\d{1,3}[\s.\-]?\(?\d{2,4}\)?[\s.\-]?\d{3,4}[\s.\-]?\d{3,4}/g,
];

const FAX_KEYWORDS = ["fax", "facsimile", "f:"];
const MOBILE_KEYWORDS = ["cell", "mobile", "direct", "personal"];
const IGNORE_PATTERNS = [
  /^000/, /^111/, /^555\d{3}1/, // Fake numbers
  /^1234/, /^0000/,
];

const PAGES_TO_CHECK = [
  "", "/contact", "/contact-us", "/about", "/about-us",
  "/location", "/locations", "/get-in-touch",
];

/**
 * Scrape a website for phone numbers.
 */
export async function findPhoneNumbers(domain: string): Promise<PhoneResult[]> {
  const phones = new Map<string, PhoneResult>();

  for (const path of PAGES_TO_CHECK) {
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

      // Extract all phone numbers
      for (const pattern of PHONE_PATTERNS) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const raw = match[0];
          const normalized = normalizePhone(raw);

          if (!normalized || normalized.length < 10) continue;
          if (IGNORE_PATTERNS.some((p) => p.test(normalized))) continue;
          if (phones.has(normalized)) continue;

          // Determine type by looking at surrounding text
          const start = Math.max(0, match.index - 100);
          const context = html.slice(start, match.index + raw.length + 50).toLowerCase();

          let type: PhoneResult["type"] = "main";
          if (FAX_KEYWORDS.some((k) => context.includes(k))) {
            type = "fax";
          } else if (MOBILE_KEYWORDS.some((k) => context.includes(k))) {
            type = "direct";
          }

          // Check if a person's name is nearby
          const nameMatch = context.match(/([A-Z][a-z]+\s[A-Z][a-z]+)/);

          phones.set(normalized, {
            phone: formatPhone(normalized),
            type,
            source: `https://${domain}${path}`,
            personName: nameMatch?.[1] ?? null,
          });
        }
      }

      // Also check for tel: links
      const telLinks = html.match(/href="tel:([^"]+)"/gi);
      if (telLinks) {
        for (const link of telLinks) {
          const num = link.replace(/href="tel:/i, "").replace(/"$/, "");
          const normalized = normalizePhone(num);
          if (normalized && normalized.length >= 10 && !phones.has(normalized)) {
            phones.set(normalized, {
              phone: formatPhone(normalized),
              type: "main",
              source: `https://${domain}${path}`,
              personName: null,
            });
          }
        }
      }
    } catch { /* continue */ }
  }

  // Sort: direct/mobile first, then main, fax last
  const typeOrder: Record<string, number> = { direct: 1, mobile: 2, main: 3, fax: 4 };
  return Array.from(phones.values()).sort(
    (a, b) => (typeOrder[a.type] ?? 5) - (typeOrder[b.type] ?? 5)
  );
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

function formatPhone(normalized: string): string {
  // Format as (xxx) xxx-xxxx for 10-digit US numbers
  if (normalized.length === 10) {
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  }
  if (normalized.length === 11 && normalized.startsWith("1")) {
    return `+1 (${normalized.slice(1, 4)}) ${normalized.slice(4, 7)}-${normalized.slice(7)}`;
  }
  return normalized;
}
