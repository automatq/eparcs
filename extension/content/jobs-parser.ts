import type { JobBoardLead, SiteType } from "../lib/types";

// Keywords that signal a role could be automated
const AUTOMATION_KEYWORDS = [
  "data entry",
  "appointment scheduling",
  "customer support",
  "receptionist",
  "administrative assistant",
  "order processing",
  "bookkeeping",
  "invoice",
  "manual",
  "repetitive",
  "spreadsheet",
  "copy paste",
  "follow up",
  "cold calling",
  "lead generation",
  "email management",
  "scheduling",
  "chat support",
  "ticket",
  "helpdesk",
];

function calculateSignalStrength(text: string): "low" | "medium" | "high" {
  const lower = text.toLowerCase();
  let matchCount = 0;
  for (const keyword of AUTOMATION_KEYWORDS) {
    if (lower.includes(keyword)) matchCount++;
  }
  if (matchCount >= 3) return "high";
  if (matchCount >= 1) return "medium";
  return "low";
}

/**
 * Extract job data from an Indeed job posting page.
 */
function extractIndeedJob(): JobBoardLead | null {
  const titleEl =
    document.querySelector("h1.jobsearch-JobInfoHeader-title") ??
    document.querySelector("h1[data-testid='jobsearch-JobInfoHeader-title']") ??
    document.querySelector(".jobsearch-JobInfoHeader-title");
  const jobTitle = titleEl?.textContent?.trim();
  if (!jobTitle) return null;

  const companyEl =
    document.querySelector("[data-testid='inlineHeader-companyName'] a") ??
    document.querySelector(".jobsearch-InlineCompanyRating a") ??
    document.querySelector("[data-company-name]");
  const company = companyEl?.textContent?.trim() ?? "Unknown Company";

  const descriptionEl =
    document.querySelector("#jobDescriptionText") ??
    document.querySelector(".jobsearch-jobDescriptionText");
  const jobDescription = descriptionEl?.textContent?.trim() ?? null;

  const strength = calculateSignalStrength(
    `${jobTitle} ${jobDescription ?? ""}`
  );

  return {
    company,
    jobTitle,
    jobDescription: jobDescription?.slice(0, 2000) ?? null,
    jobUrl: window.location.href,
    source: "jobboard",
    leadType: "person",
    signalType: "hiring-repetitive-role",
    signalStrength: strength,
  };
}

/**
 * Extract job data from LinkedIn Jobs page.
 */
function extractLinkedInJob(): JobBoardLead | null {
  const titleEl =
    document.querySelector(".job-details-jobs-unified-top-card__job-title h1") ??
    document.querySelector(".jobs-unified-top-card__job-title");
  const jobTitle = titleEl?.textContent?.trim();
  if (!jobTitle) return null;

  const companyEl =
    document.querySelector(".job-details-jobs-unified-top-card__company-name a") ??
    document.querySelector(".jobs-unified-top-card__company-name a");
  const company = companyEl?.textContent?.trim() ?? "Unknown Company";

  const descriptionEl = document.querySelector(
    ".jobs-description-content__text"
  );
  const jobDescription = descriptionEl?.textContent?.trim() ?? null;

  const strength = calculateSignalStrength(
    `${jobTitle} ${jobDescription ?? ""}`
  );

  return {
    company,
    jobTitle,
    jobDescription: jobDescription?.slice(0, 2000) ?? null,
    jobUrl: window.location.href,
    source: "jobboard",
    leadType: "person",
    signalType: "hiring-repetitive-role",
    signalStrength: strength,
  };
}

export function init(siteType: SiteType) {
  setTimeout(() => {
    let lead: JobBoardLead | null = null;

    if (siteType === "indeed-job" || siteType === "indeed-search") {
      lead = extractIndeedJob();
    } else if (siteType === "linkedin-jobs") {
      lead = extractLinkedInJob();
    }

    if (lead) {
      chrome.runtime.sendMessage({
        type: "LEAD_EXTRACTED",
        payload: { leads: [lead], siteType },
      });
    }
  }, 2000);
}
