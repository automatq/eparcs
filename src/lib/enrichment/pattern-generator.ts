/**
 * Generate candidate email addresses from a person's name and company domain.
 * Most companies use one of ~15 common patterns.
 * Returns candidates ordered by likelihood (most common patterns first).
 */
export function generateEmailCandidates(
  firstName: string,
  lastName: string,
  domain: string
): { email: string; pattern: string }[] {
  const f = firstName.toLowerCase().trim();
  const l = lastName.toLowerCase().trim();
  const fi = f[0]; // first initial
  const li = l[0]; // last initial

  if (!f || !l || !domain) return [];

  const d = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

  // Ordered by real-world frequency (studies show first.last@ is ~30% of all businesses)
  const patterns: { email: string; pattern: string }[] = [
    { email: `${f}.${l}@${d}`, pattern: "first.last" },
    { email: `${f}@${d}`, pattern: "first" },
    { email: `${f}${l}@${d}`, pattern: "firstlast" },
    { email: `${fi}${l}@${d}`, pattern: "flast" },
    { email: `${f}${li}@${d}`, pattern: "firstl" },
    { email: `${f}_${l}@${d}`, pattern: "first_last" },
    { email: `${f}-${l}@${d}`, pattern: "first-last" },
    { email: `${l}.${f}@${d}`, pattern: "last.first" },
    { email: `${l}@${d}`, pattern: "last" },
    { email: `${l}${f}@${d}`, pattern: "lastfirst" },
    { email: `${fi}.${l}@${d}`, pattern: "f.last" },
    { email: `${fi}${l[0]}@${d}`, pattern: "fl" },
    { email: `${f}.${li}@${d}`, pattern: "first.l" },
    { email: `${l}${fi}@${d}`, pattern: "lastf" },
    { email: `${l}_${f}@${d}`, pattern: "last_first" },
  ];

  return patterns;
}

/**
 * Extract first and last name from a full name string.
 * Handles common formats: "John Smith", "Dr. John Smith", "John Q. Smith Jr."
 */
export function parseFullName(fullName: string): { firstName: string; lastName: string } | null {
  const cleaned = fullName
    .replace(/\b(dr|mr|ms|mrs|prof|sr|jr|ii|iii|iv|phd|md|esq)\b\.?/gi, "")
    .trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);

  if (parts.length === 0) return null;
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };

  // Handle middle names/initials — take first and last
  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
  };
}

/**
 * Extract domain from a company name or URL.
 * If given a URL, extracts the domain.
 * If given a company name, tries common TLDs.
 */
export function guessDomain(input: string): string[] {
  // If it looks like a URL or domain, clean it
  if (input.includes(".") && !input.includes(" ")) {
    const domain = input
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
    return [domain];
  }

  // Company name → guess domains
  const slug = input
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|group|agency|studio|labs|io)\b\.?/gi, "")
    .trim()
    .replace(/[^a-z0-9]/g, "");

  if (!slug) return [];

  return [
    `${slug}.com`,
    `${slug}.io`,
    `${slug}.co`,
    `${slug}.agency`,
    `${slug}.ai`,
    `${slug}.net`,
    `${slug}.org`,
  ];
}
