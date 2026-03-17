/**
 * Personalization Signals
 *
 * Deep-scrapes additional context about a lead to make outreach hyper-personal:
 * 1. Google Reviews — extract recent reviews with pain points
 * 2. Tech Stack — detect what tools they use (via website HTML)
 * 3. Social Presence — check for podcast, YouTube, blog
 * 4. Website Analysis — what they sell, their messaging, gaps
 */

import { aiComplete, parseAIJson } from "@/lib/ai/provider";

export interface PersonalizationSignals {
  reviewInsights: ReviewInsight[];
  techStack: TechSignal[];
  socialPresence: SocialSignal[];
  websiteInsights: WebsiteInsight | null;
  bestHook: string; // AI-generated best personalization hook for outreach
}

export interface ReviewInsight {
  text: string;
  sentiment: "positive" | "negative" | "neutral";
  painPoint: string | null;
  automationOpportunity: string | null;
}

export interface TechSignal {
  technology: string;
  category: string; // "crm", "marketing", "analytics", "ecommerce", etc.
  automationRelevance: string | null;
}

export interface SocialSignal {
  platform: string;
  url: string | null;
  type: "podcast" | "youtube" | "blog" | "twitter" | "instagram" | "facebook";
}

export interface WebsiteInsight {
  businessDescription: string;
  services: string[];
  messagingGaps: string[];
  automationOpportunities: string[];
}

// ── Tech stack detection patterns ──

const TECH_PATTERNS: { pattern: RegExp; tech: string; category: string }[] = [
  // CRM & Marketing
  { pattern: /hubspot/i, tech: "HubSpot", category: "crm" },
  { pattern: /salesforce/i, tech: "Salesforce", category: "crm" },
  { pattern: /mailchimp/i, tech: "Mailchimp", category: "email-marketing" },
  { pattern: /klaviyo/i, tech: "Klaviyo", category: "email-marketing" },
  { pattern: /activecampaign/i, tech: "ActiveCampaign", category: "marketing-automation" },
  { pattern: /intercom/i, tech: "Intercom", category: "chat" },
  { pattern: /drift/i, tech: "Drift", category: "chat" },
  { pattern: /zendesk/i, tech: "Zendesk", category: "support" },
  { pattern: /freshdesk/i, tech: "Freshdesk", category: "support" },
  { pattern: /calendly/i, tech: "Calendly", category: "scheduling" },

  // Website platforms
  { pattern: /wp-content|wordpress/i, tech: "WordPress", category: "cms" },
  { pattern: /shopify/i, tech: "Shopify", category: "ecommerce" },
  { pattern: /wix\.com/i, tech: "Wix", category: "cms" },
  { pattern: /squarespace/i, tech: "Squarespace", category: "cms" },
  { pattern: /webflow/i, tech: "Webflow", category: "cms" },

  // Analytics
  { pattern: /google-analytics|gtag|ga\(/i, tech: "Google Analytics", category: "analytics" },
  { pattern: /facebook\.net\/en_US\/fbevents/i, tech: "Facebook Pixel", category: "advertising" },
  { pattern: /hotjar/i, tech: "Hotjar", category: "analytics" },

  // Booking/scheduling
  { pattern: /acuityscheduling/i, tech: "Acuity Scheduling", category: "scheduling" },
  { pattern: /booksy/i, tech: "Booksy", category: "scheduling" },
  { pattern: /mindbody/i, tech: "Mindbody", category: "scheduling" },
  { pattern: /jane\.app/i, tech: "Jane App", category: "scheduling" },

  // Forms
  { pattern: /typeform/i, tech: "Typeform", category: "forms" },
  { pattern: /jotform/i, tech: "JotForm", category: "forms" },
];

// ── Social presence detection ──

const SOCIAL_PATTERNS: { pattern: RegExp; type: SocialSignal["type"]; platform: string }[] = [
  { pattern: /youtube\.com\/(channel|c|@)/i, type: "youtube", platform: "YouTube" },
  { pattern: /podcasts?\.apple\.com/i, type: "podcast", platform: "Apple Podcasts" },
  { pattern: /spotify\.com\/show/i, type: "podcast", platform: "Spotify" },
  { pattern: /twitter\.com|x\.com/i, type: "twitter", platform: "Twitter/X" },
  { pattern: /instagram\.com/i, type: "instagram", platform: "Instagram" },
  { pattern: /facebook\.com/i, type: "facebook", platform: "Facebook" },
  { pattern: /\/blog\b/i, type: "blog", platform: "Blog" },
];

/**
 * Scrape a website for tech stack and social presence signals.
 */
async function scrapeWebsiteSignals(domain: string): Promise<{
  techStack: TechSignal[];
  socialPresence: SocialSignal[];
  htmlContent: string;
}> {
  const techStack: TechSignal[] = [];
  const socialPresence: SocialSignal[] = [];
  let htmlContent = "";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`https://${domain}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ScrapedBot/1.0)",
        Accept: "text/html",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return { techStack, socialPresence, htmlContent };

    htmlContent = await response.text();

    // Detect tech stack
    const seen = new Set<string>();
    for (const { pattern, tech, category } of TECH_PATTERNS) {
      if (pattern.test(htmlContent) && !seen.has(tech)) {
        seen.add(tech);
        techStack.push({ technology: tech, category, automationRelevance: null });
      }
    }

    // Detect social presence
    for (const { pattern, type, platform } of SOCIAL_PATTERNS) {
      const match = htmlContent.match(new RegExp(`href=["'](https?://[^"']*${pattern.source}[^"']*)["']`, "i"));
      if (match) {
        socialPresence.push({ platform, type, url: match[1] });
      }
    }

    // Check for blog by looking at /blog path
    if (!socialPresence.find((s) => s.type === "blog")) {
      try {
        const blogRes = await fetch(`https://${domain}/blog`, { method: "HEAD", redirect: "follow" });
        if (blogRes.ok) {
          socialPresence.push({ platform: "Blog", type: "blog", url: `https://${domain}/blog` });
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  return { techStack, socialPresence, htmlContent };
}

/**
 * Use AI to analyze the website content and extract business insights.
 */
async function analyzeWebsite(htmlContent: string, domain: string): Promise<WebsiteInsight | null> {
  if (!htmlContent || htmlContent.length < 200) return null;

  // Extract visible text (strip HTML tags)
  const textContent = htmlContent
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);

  if (textContent.length < 100) return null;

  const text = await aiComplete({
    prompt: `Analyze this business website (${domain}) and respond in JSON:

{
  "businessDescription": "<what this business does in 1 sentence>",
  "services": ["<service 1>", "<service 2>"],
  "messagingGaps": ["<gap in their website/marketing that AI could fix>"],
  "automationOpportunities": ["<specific process they could automate with AI>"]
}

Website content:
${textContent}`,
    maxTokens: 512,
  });

  return parseAIJson<WebsiteInsight>(text);
}

/**
 * Generate the best personalization hook for outreach.
 */
async function generateBestHook(signals: Omit<PersonalizationSignals, "bestHook">, leadName: string): Promise<string> {
  let context = "";
  if (signals.reviewInsights.length > 0) {
    const negative = signals.reviewInsights.filter((r) => r.sentiment === "negative");
    if (negative.length > 0) {
      context += `Negative reviews mention: ${negative.map((r) => r.painPoint).filter(Boolean).join(", ")}\n`;
    }
  }
  if (signals.techStack.length > 0) {
    context += `Tech stack: ${signals.techStack.map((t) => t.technology).join(", ")}\n`;
  }
  if (signals.socialPresence.length > 0) {
    context += `Social presence: ${signals.socialPresence.map((s) => s.platform).join(", ")}\n`;
  }
  if (signals.websiteInsights) {
    context += `Business: ${signals.websiteInsights.businessDescription}\n`;
    if (signals.websiteInsights.automationOpportunities.length > 0) {
      context += `Automation opportunities: ${signals.websiteInsights.automationOpportunities.join(", ")}\n`;
    }
  }

  if (!context) return "No strong personalization signals found — use a general industry-specific opener.";

  const result = await aiComplete({
    prompt: `Based on these signals about ${leadName}'s business, write the single best opening line for a cold outreach email. Make it specific and non-generic. One sentence only.

${context}`,
    maxTokens: 200,
  });

  return result.trim();
}

/**
 * Gather all personalization signals for a lead.
 */
export async function gatherSignals(params: {
  leadName: string;
  domain: string | null;
  googleMapsUrl: string | null;
}): Promise<PersonalizationSignals> {
  const signals: Omit<PersonalizationSignals, "bestHook"> = {
    reviewInsights: [],
    techStack: [],
    socialPresence: [],
    websiteInsights: null,
  };

  // Scrape website if we have a domain
  if (params.domain) {
    const webSignals = await scrapeWebsiteSignals(params.domain);
    signals.techStack = webSignals.techStack;
    signals.socialPresence = webSignals.socialPresence;

    // Add automation relevance to tech signals
    for (const tech of signals.techStack) {
      if (tech.category === "cms" && ["WordPress", "Wix"].includes(tech.technology)) {
        tech.automationRelevance = "Basic website — likely manual processes, no custom integrations";
      }
      if (tech.category === "scheduling") {
        tech.automationRelevance = "Uses scheduling tool — could benefit from AI-powered booking and follow-ups";
      }
      if (tech.category === "support") {
        tech.automationRelevance = "Has support tool — AI chatbot could handle tier-1 tickets";
      }
      if (!tech.automationRelevance && tech.category === "chat") {
        tech.automationRelevance = "Has chat widget — could upgrade to AI-powered conversations";
      }
    }

    // AI website analysis
    if (webSignals.htmlContent.length > 200) {
      signals.websiteInsights = await analyzeWebsite(webSignals.htmlContent, params.domain);
    }
  }

  // Generate the best personalization hook
  const bestHook = await generateBestHook(signals, params.leadName);

  return { ...signals, bestHook };
}
