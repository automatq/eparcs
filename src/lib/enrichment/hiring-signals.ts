/**
 * Hiring Signals Aggregator
 *
 * Searches job boards for active postings at a company.
 * Active hiring = growing = has budget = good lead.
 * Specific roles signal automation need.
 */

const AUTOMATION_ROLE_KEYWORDS = [
  "data entry", "receptionist", "appointment scheduling",
  "customer support", "customer service", "call center",
  "administrative assistant", "office manager",
  "bookkeeping", "order processing", "invoicing",
  "social media manager", "email marketing",
  "chat support", "helpdesk", "front desk",
];

export interface HiringSignal {
  title: string;
  url: string;
  isAutomatable: boolean;
  automationReason: string | null;
}

export interface HiringResult {
  jobPostingCount: number;
  automatableRoles: number;
  signals: HiringSignal[];
  growthIndicator: "rapid" | "moderate" | "stable" | "unknown";
}

/**
 * Search for active job postings at a company.
 */
export async function findHiringSignals(companyName: string): Promise<HiringResult> {
  const signals: HiringSignal[] = [];

  // Search Indeed for jobs at this company
  try {
    const encoded = encodeURIComponent(companyName);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(
      `https://www.indeed.com/jobs?q=${encoded}&sort=date`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "text/html",
        },
      }
    );
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();

      // Extract job titles from search results
      const titleMatches = html.match(new RegExp('<h2[^>]*class="[^"]*jobTitle[^"]*"[^>]*>.*?<a[^>]*>(.*?)<\\/a>', 'gs')) ?? [];

      for (const match of titleMatches.slice(0, 20)) {
        const titleText = match.replace(/<[^>]+>/g, "").trim();
        if (!titleText || titleText.length < 3) continue;

        const titleLower = titleText.toLowerCase();
        const isAutomatable = AUTOMATION_ROLE_KEYWORDS.some((k) => titleLower.includes(k));
        let automationReason: string | null = null;

        if (isAutomatable) {
          const matchedKeyword = AUTOMATION_ROLE_KEYWORDS.find((k) => titleLower.includes(k));
          automationReason = `"${matchedKeyword}" role can be automated with AI`;
        }

        signals.push({
          title: titleText,
          url: `https://www.indeed.com/jobs?q=${encoded}`,
          isAutomatable,
          automationReason,
        });
      }
    }
  } catch { /* Indeed search failed */ }

  const automatableRoles = signals.filter((s) => s.isAutomatable).length;
  const growthIndicator: HiringResult["growthIndicator"] =
    signals.length >= 10 ? "rapid" :
    signals.length >= 5 ? "moderate" :
    signals.length >= 1 ? "stable" : "unknown";

  return {
    jobPostingCount: signals.length,
    automatableRoles,
    signals: signals.slice(0, 10), // Cap at 10
    growthIndicator,
  };
}
