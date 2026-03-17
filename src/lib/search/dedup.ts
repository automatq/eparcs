/**
 * Cross-Source Lead Deduplication
 *
 * When results come from multiple sources (Google Maps, Yelp, BBB),
 * we need to merge duplicates into a single lead with the richest data.
 */

interface LeadCandidate {
  name: string;
  phone?: string | null;
  website?: string | null;
  domain?: string | null;
  address?: string | null;
  location?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  category?: string | null;
  source: string;
  [key: string]: any;
}

/**
 * Check if two leads are likely the same business.
 */
function areDuplicates(a: LeadCandidate, b: LeadCandidate): boolean {
  // 1. Exact domain match
  if (a.domain && b.domain && a.domain === b.domain) return true;

  // 2. Phone number match (normalize: strip non-digits)
  if (a.phone && b.phone) {
    const normalA = a.phone.replace(/\D/g, "").slice(-10);
    const normalB = b.phone.replace(/\D/g, "").slice(-10);
    if (normalA.length >= 10 && normalA === normalB) return true;
  }

  // 3. Fuzzy name + same city
  const nameA = normalizeName(a.name);
  const nameB = normalizeName(b.name);
  const cityA = extractCity(a.address ?? a.location ?? "");
  const cityB = extractCity(b.address ?? b.location ?? "");

  if (nameA && nameB && cityA && cityB) {
    const nameSimilarity = jaccardSimilarity(nameA, nameB);
    if (nameSimilarity > 0.7 && cityA.toLowerCase() === cityB.toLowerCase()) {
      return true;
    }
  }

  return false;
}

/**
 * Merge two lead candidates, keeping the richest data.
 */
function mergeCandidates(
  existing: LeadCandidate,
  incoming: LeadCandidate
): LeadCandidate {
  const merged = { ...existing };

  // Fill in missing fields from incoming
  for (const key of Object.keys(incoming)) {
    const val = incoming[key];
    if (val != null && val !== "" && (merged[key] == null || merged[key] === "")) {
      merged[key] = val;
    }
  }

  // Prefer higher review counts (more data)
  if (
    incoming.reviewCount != null &&
    (existing.reviewCount == null || incoming.reviewCount > existing.reviewCount)
  ) {
    merged.rating = incoming.rating;
    merged.reviewCount = incoming.reviewCount;
  }

  // Track which sources contributed
  const sources = new Set(
    (existing.source ?? "").split(",").concat(incoming.source.split(","))
  );
  merged.source = Array.from(sources).filter(Boolean).join(",");

  return merged;
}

/**
 * Deduplicate a list of lead candidates from multiple sources.
 */
export function deduplicateLeads(
  candidates: LeadCandidate[]
): LeadCandidate[] {
  const unique: LeadCandidate[] = [];

  for (const candidate of candidates) {
    // Extract domain from website
    if (candidate.website && !candidate.domain) {
      try {
        candidate.domain = new URL(
          candidate.website.startsWith("http")
            ? candidate.website
            : `https://${candidate.website}`
        ).hostname
          .replace(/^www\./, "");
      } catch {}
    }

    let merged = false;
    for (let i = 0; i < unique.length; i++) {
      if (areDuplicates(unique[i], candidate)) {
        unique[i] = mergeCandidates(unique[i], candidate);
        merged = true;
        break;
      }
    }

    if (!merged) {
      unique.push(candidate);
    }
  }

  return unique;
}

// ── Helpers ──

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(inc|llc|ltd|corp|co|the|and)\b/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function extractCity(location: string): string {
  // Try to extract city from "123 Main St, Dallas, TX" or "Dallas, TX"
  const parts = location.split(",").map((p) => p.trim());
  if (parts.length >= 2) {
    return parts[parts.length - 2]; // Second to last is usually city
  }
  return parts[0] ?? "";
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(" "));
  const setB = new Set(b.split(" "));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}
