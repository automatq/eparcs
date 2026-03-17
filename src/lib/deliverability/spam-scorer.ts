/**
 * Spam Score Checker
 *
 * Scans outreach email content for spam triggers before sending.
 * Returns a 0-100 score (lower = better, fewer spam signals).
 */

const SPAM_TRIGGERS: { pattern: RegExp; weight: number; label: string }[] = [
  // High-weight triggers
  { pattern: /free/i, weight: 3, label: "Contains 'free'" },
  { pattern: /buy now/i, weight: 5, label: "Contains 'buy now'" },
  { pattern: /act now/i, weight: 4, label: "Contains 'act now'" },
  { pattern: /limited time/i, weight: 4, label: "Contains 'limited time'" },
  { pattern: /click here/i, weight: 4, label: "Contains 'click here'" },
  { pattern: /guaranteed/i, weight: 3, label: "Contains 'guaranteed'" },
  { pattern: /no obligation/i, weight: 3, label: "Contains 'no obligation'" },
  { pattern: /risk[- ]free/i, weight: 3, label: "Contains 'risk-free'" },
  { pattern: /\$\d+/g, weight: 2, label: "Contains dollar amounts" },
  { pattern: /!!!+/g, weight: 5, label: "Excessive exclamation marks" },
  { pattern: /URGENT/i, weight: 4, label: "Contains 'URGENT'" },
  { pattern: /100%/i, weight: 2, label: "Contains '100%'" },
  { pattern: /unsubscribe/i, weight: -2, label: "Has unsubscribe (good)" },

  // Medium-weight triggers
  { pattern: /congratulations/i, weight: 3, label: "Contains 'congratulations'" },
  { pattern: /winner/i, weight: 3, label: "Contains 'winner'" },
  { pattern: /dear friend/i, weight: 4, label: "Contains 'dear friend'" },
  { pattern: /increase.*revenue/i, weight: 2, label: "Revenue promises" },
  { pattern: /10x|100x/i, weight: 2, label: "Multiplication claims" },
  { pattern: /exclusive deal/i, weight: 3, label: "Contains 'exclusive deal'" },

  // Low-weight formatting issues
  { pattern: /[A-Z]{5,}/g, weight: 2, label: "ALL CAPS words" },
  { pattern: /<img/i, weight: 1, label: "Contains images" },
  { pattern: /font-size:\s*[2-9]\d+/i, weight: 2, label: "Large font sizes" },
];

export interface SpamScoreResult {
  score: number; // 0-100, lower is better
  rating: "excellent" | "good" | "warning" | "danger";
  triggers: { label: string; weight: number }[];
  suggestions: string[];
}

export function checkSpamScore(subject: string, body: string): SpamScoreResult {
  const fullText = `${subject} ${body}`;
  const triggers: { label: string; weight: number }[] = [];
  let totalWeight = 0;

  for (const trigger of SPAM_TRIGGERS) {
    const matches = fullText.match(trigger.pattern);
    if (matches) {
      triggers.push({ label: trigger.label, weight: trigger.weight });
      totalWeight += trigger.weight * (matches.length > 1 ? Math.min(matches.length, 3) : 1);
    }
  }

  // Check email length (too short or too long = suspicious)
  if (body.length < 50) {
    triggers.push({ label: "Email too short", weight: 2 });
    totalWeight += 2;
  }
  if (body.length > 2000) {
    triggers.push({ label: "Email too long", weight: 1 });
    totalWeight += 1;
  }

  // Check link density
  const linkCount = (body.match(/https?:\/\//g) || []).length;
  if (linkCount > 3) {
    triggers.push({ label: `Too many links (${linkCount})`, weight: 3 });
    totalWeight += 3;
  }

  // Normalize to 0-100 (capped)
  const score = Math.min(100, Math.max(0, totalWeight * 5));

  const rating =
    score <= 10 ? "excellent" :
    score <= 30 ? "good" :
    score <= 60 ? "warning" : "danger";

  const suggestions: string[] = [];
  if (score > 30) {
    suggestions.push("Remove spam trigger words");
    if (linkCount > 2) suggestions.push("Reduce the number of links");
    if (body.length > 1500) suggestions.push("Shorten your email");
  }
  if (!body.includes("{{unsubscribe}}") && !body.toLowerCase().includes("unsubscribe")) {
    suggestions.push("Consider adding an unsubscribe option");
  }

  return { score, rating, triggers, suggestions };
}
