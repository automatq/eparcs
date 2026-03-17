/**
 * Company Data Enricher
 *
 * Gathers comprehensive company intelligence from multiple sources:
 * 1. Website analysis (AI-powered)
 * 2. Social profiles (LinkedIn, Twitter, Facebook)
 * 3. Hiring signals (job postings)
 * 4. News and events
 * 5. Employee count and revenue estimation
 */

import { searchForSocialProfiles, searchForNews, searchForPeople } from "./google-search";
import { scrapeLinkedInCompanySize } from "./social-scraper";
import { findHiringSignals, type HiringResult } from "./hiring-signals";
import { estimateRevenue } from "../icp/engine";
import { aiComplete, parseAIJson } from "../ai/provider";

export interface CompanyIntelligence {
  companyName: string;
  domain: string | null;
  employeeCount: number | null;
  employeeRange: string | null;
  estimatedRevenue: number;
  revenueConfidence: string;
  foundedYear: number | null;
  industry: string | null;
  subIndustry: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  facebookUrl: string | null;
  hiringSignals: HiringResult;
  recentNews: { title: string; url: string; snippet: string }[];
  techStack: string[];
  decisionMakers: { name: string; title: string; source: string }[];
}

/**
 * Enrich a company with data from multiple sources.
 */
export async function enrichCompany(params: {
  companyName: string;
  domain: string | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  location: string | null;
}): Promise<CompanyIntelligence> {
  const result: CompanyIntelligence = {
    companyName: params.companyName,
    domain: params.domain,
    employeeCount: null,
    employeeRange: null,
    estimatedRevenue: 0,
    revenueConfidence: "low",
    foundedYear: null,
    industry: null,
    subIndustry: null,
    linkedinUrl: null,
    twitterUrl: null,
    facebookUrl: null,
    hiringSignals: { jobPostingCount: 0, automatableRoles: 0, signals: [], growthIndicator: "unknown" },
    recentNews: [],
    techStack: [],
    decisionMakers: [],
  };

  // Run multiple enrichments in parallel
  const [socialProfiles, news, people, hiring] = await Promise.allSettled([
    searchForSocialProfiles(params.companyName),
    searchForNews(params.companyName),
    searchForPeople(params.companyName),
    findHiringSignals(params.companyName),
  ]);

  // Social profiles
  if (socialProfiles.status === "fulfilled") {
    for (const profile of socialProfiles.value) {
      if (profile.platform === "linkedin") result.linkedinUrl = profile.url;
      if (profile.platform === "twitter") result.twitterUrl = profile.url;
      if (profile.platform === "facebook") result.facebookUrl = profile.url;
    }
  }

  // News
  if (news.status === "fulfilled") {
    result.recentNews = news.value;
  }

  // Decision makers from Google
  if (people.status === "fulfilled") {
    result.decisionMakers = people.value;
  }

  // Hiring signals
  if (hiring.status === "fulfilled") {
    result.hiringSignals = hiring.value;
  }

  // Employee count from LinkedIn
  if (result.linkedinUrl) {
    try {
      const linkedinData = await scrapeLinkedInCompanySize(result.linkedinUrl);
      if (linkedinData.employeeCount) {
        result.employeeCount = linkedinData.employeeCount;
        result.employeeRange = linkedinData.employeeRange;
      }
      if (linkedinData.industry) result.industry = linkedinData.industry;
    } catch { /* continue */ }
  }

  // Revenue estimation
  const revenue = estimateRevenue({
    category: params.category,
    reviewCount: params.reviewCount,
    rating: params.rating,
    location: params.location,
  });
  result.estimatedRevenue = revenue.estimate;
  result.revenueConfidence = revenue.confidence;

  // Website analysis for founded year, tech stack, and AI-based employee estimate
  if (params.domain) {
    try {
      const websiteData = await analyzeWebsiteForCompanyData(params.domain);
      if (websiteData.foundedYear) result.foundedYear = websiteData.foundedYear;
      if (websiteData.industry && !result.industry) result.industry = websiteData.industry;
      if (websiteData.techStack.length > 0) result.techStack = websiteData.techStack;
      if (websiteData.employeeEstimate && !result.employeeCount) {
        result.employeeCount = websiteData.employeeEstimate;
        result.employeeRange = getRange(websiteData.employeeEstimate);
      }
    } catch { /* continue */ }
  }

  return result;
}

/**
 * Analyze a website for company data using AI.
 */
async function analyzeWebsiteForCompanyData(domain: string): Promise<{
  foundedYear: number | null;
  industry: string | null;
  techStack: string[];
  employeeEstimate: number | null;
}> {
  let html = "";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://${domain}`, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScrapedBot/1.0)" },
    });
    clearTimeout(timeout);
    if (res.ok) html = await res.text();
  } catch { return { foundedYear: null, industry: null, techStack: [], employeeEstimate: null }; }

  if (html.length < 200) return { foundedYear: null, industry: null, techStack: [], employeeEstimate: null };

  // Extract founded year from footer (common pattern: "© 2015" or "Est. 2010")
  let foundedYear: number | null = null;
  const footerMatch = html.match(/(?:©|copyright|est\.?|since|founded)\s*(\d{4})/i);
  if (footerMatch) {
    const year = parseInt(footerMatch[1]);
    if (year >= 1900 && year <= 2026) foundedYear = year;
  }

  // Extract text for AI analysis
  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);

  // Tech stack detection (reuse patterns from personalization signals)
  const techStack: string[] = [];
  const techPatterns: [RegExp, string][] = [
    [/wordpress|wp-content/i, "WordPress"],
    [/shopify/i, "Shopify"],
    [/wix\.com/i, "Wix"],
    [/squarespace/i, "Squarespace"],
    [/hubspot/i, "HubSpot"],
    [/salesforce/i, "Salesforce"],
    [/intercom/i, "Intercom"],
    [/zendesk/i, "Zendesk"],
    [/calendly/i, "Calendly"],
    [/mailchimp/i, "Mailchimp"],
    [/google-analytics|gtag/i, "Google Analytics"],
    [/facebook.*pixel|fbevents/i, "Facebook Pixel"],
    [/hotjar/i, "Hotjar"],
    [/stripe/i, "Stripe"],
  ];
  for (const [pattern, name] of techPatterns) {
    if (pattern.test(html)) techStack.push(name);
  }

  // AI analysis for industry and employee estimate
  let industry: string | null = null;
  let employeeEstimate: number | null = null;

  if (textContent.length > 100) {
    try {
      const text = await aiComplete({
        prompt: `From this website text, extract:
1. Industry (one phrase, e.g., "dental care", "real estate", "software")
2. Estimated employee count (best guess from the website content, team mentions, etc.)

Respond JSON: {"industry": "...", "employeeEstimate": <number or null>}

Website (${domain}):
${textContent}`,
        maxTokens: 150,
      });

      const parsed = parseAIJson<{ industry: string; employeeEstimate: number | null }>(text);
      if (parsed) {
        industry = parsed.industry;
        employeeEstimate = parsed.employeeEstimate;
      }
    } catch { /* AI failed */ }
  }

  return { foundedYear, industry, techStack, employeeEstimate };
}

function getRange(count: number): string {
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  if (count <= 200) return "51-200";
  if (count <= 500) return "201-500";
  if (count <= 1000) return "501-1000";
  return "1001+";
}
