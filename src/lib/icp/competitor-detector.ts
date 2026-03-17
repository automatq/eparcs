/**
 * Competitive Intelligence Detector
 *
 * Scans a lead's website for signs they're already using competitor tools.
 * Also detects what tech they use that could be replaced by AI automation.
 */

// Common AI/automation competitors and their website fingerprints
const COMPETITOR_SIGNATURES: { name: string; patterns: RegExp[] }[] = [
  // AI Chatbots
  { name: "Intercom", patterns: [/intercom/i, /widget\.intercom\.io/i] },
  { name: "Drift", patterns: [/drift\.com/i, /js\.driftt\.com/i] },
  { name: "Tidio", patterns: [/tidio/i, /code\.tidio\.co/i] },
  { name: "Crisp", patterns: [/crisp\.chat/i, /client\.crisp\.chat/i] },
  { name: "LiveChat", patterns: [/livechat/i, /cdn\.livechatinc\.com/i] },
  { name: "Zendesk Chat", patterns: [/zopim/i, /zendesk.*chat/i] },
  { name: "ChatGPT Widget", patterns: [/chatgpt/i, /openai.*widget/i] },

  // CRM & Marketing Automation
  { name: "HubSpot", patterns: [/hubspot/i, /js\.hs-scripts\.com/i, /hs-banner/i] },
  { name: "Salesforce", patterns: [/salesforce/i, /force\.com/i] },
  { name: "ActiveCampaign", patterns: [/activecampaign/i, /trackcmp\.net/i] },
  { name: "Mailchimp", patterns: [/mailchimp/i, /mc\.us\d+\.list-manage/i] },
  { name: "Klaviyo", patterns: [/klaviyo/i, /static\.klaviyo\.com/i] },
  { name: "GoHighLevel", patterns: [/gohighlevel/i, /msgsndr\.com/i, /leadconnectorhq/i] },

  // Scheduling
  { name: "Calendly", patterns: [/calendly/i, /assets\.calendly\.com/i] },
  { name: "Acuity Scheduling", patterns: [/acuityscheduling/i] },
  { name: "Cal.com", patterns: [/cal\.com/i] },

  // Reviews & Reputation
  { name: "Birdeye", patterns: [/birdeye/i] },
  { name: "Podium", patterns: [/podium/i] },
  { name: "NiceJob", patterns: [/nicejob/i] },

  // Other automation
  { name: "Zapier", patterns: [/zapier/i] },
  { name: "Make.com", patterns: [/make\.com/i, /integromat/i] },
];

// Things that signal they DON'T have automation (opportunity for you)
const MISSING_AUTOMATION_SIGNALS: { signal: string; patterns: RegExp[] }[] = [
  { signal: "No chat widget — could use AI chatbot", patterns: [/livechat|intercom|drift|tidio|crisp|tawk|zendesk.*chat/i] },
  { signal: "No scheduling tool — could use AI booking", patterns: [/calendly|acuity|cal\.com|booksy|mindbody/i] },
  { signal: "No CRM detected — could use automated follow-ups", patterns: [/hubspot|salesforce|activecampaign|gohighlevel/i] },
  { signal: "No review management — could use AI review responses", patterns: [/birdeye|podium|nicejob/i] },
];

export interface CompetitorResult {
  competitorsFound: { name: string; category: string }[];
  missingAutomation: string[];
  overallAssessment: "saturated" | "some_tools" | "wide_open";
  pitchAngle: string;
}

/**
 * Scan a website for competitor tools and automation gaps.
 */
export async function detectCompetitors(domain: string): Promise<CompetitorResult> {
  let html = "";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://${domain}`, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScrapedBot/1.0)" },
    });
    clearTimeout(timeout);
    if (res.ok) html = await res.text();
  } catch {
    return {
      competitorsFound: [],
      missingAutomation: [],
      overallAssessment: "wide_open",
      pitchAngle: "Could not scan website — pitch general AI automation benefits.",
    };
  }

  if (!html) {
    return {
      competitorsFound: [],
      missingAutomation: [],
      overallAssessment: "wide_open",
      pitchAngle: "No website content found — they may need a digital presence overhaul.",
    };
  }

  // Detect competitors
  const competitorsFound: { name: string; category: string }[] = [];
  for (const comp of COMPETITOR_SIGNATURES) {
    if (comp.patterns.some((p) => p.test(html))) {
      const category =
        ["Intercom", "Drift", "Tidio", "Crisp", "LiveChat", "Zendesk Chat", "ChatGPT Widget"].includes(comp.name) ? "chatbot" :
        ["HubSpot", "Salesforce", "ActiveCampaign", "Mailchimp", "Klaviyo", "GoHighLevel"].includes(comp.name) ? "crm" :
        ["Calendly", "Acuity Scheduling", "Cal.com"].includes(comp.name) ? "scheduling" :
        ["Birdeye", "Podium", "NiceJob"].includes(comp.name) ? "reviews" :
        "automation";
      competitorsFound.push({ name: comp.name, category });
    }
  }

  // Detect missing automation
  const missingAutomation: string[] = [];
  for (const signal of MISSING_AUTOMATION_SIGNALS) {
    if (!signal.patterns.some((p) => p.test(html))) {
      missingAutomation.push(signal.signal);
    }
  }

  const overallAssessment: CompetitorResult["overallAssessment"] =
    competitorsFound.length >= 3 ? "saturated" :
    competitorsFound.length >= 1 ? "some_tools" :
    "wide_open";

  let pitchAngle: string;
  if (overallAssessment === "saturated") {
    pitchAngle = `They already use ${competitorsFound.map((c) => c.name).join(", ")}. Pitch consolidation — one AI platform replacing multiple tools, saving money and complexity.`;
  } else if (overallAssessment === "some_tools") {
    const gaps = missingAutomation.slice(0, 2).join(". ");
    pitchAngle = `They use ${competitorsFound.map((c) => c.name).join(", ")} but are missing: ${gaps}. Pitch the gaps.`;
  } else {
    pitchAngle = `Wide open — no automation tools detected. ${missingAutomation.slice(0, 3).join(". ")}. Pitch full AI automation suite.`;
  }

  return { competitorsFound, missingAutomation, overallAssessment, pitchAngle };
}
