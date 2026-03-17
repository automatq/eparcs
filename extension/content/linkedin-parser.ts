import type { LinkedInLead, SiteType } from "../lib/types";

/**
 * Extract lead data from a LinkedIn profile page.
 * Reads the visible DOM — no automated actions.
 */
function extractProfileData(): LinkedInLead | null {
  // Name — usually in h1 within the intro section
  const nameEl =
    document.querySelector("h1.text-heading-xlarge") ??
    document.querySelector(".pv-top-card--list h1") ??
    document.querySelector("h1");
  const name = nameEl?.textContent?.trim();
  if (!name) return null;

  // Title/headline — below the name
  const titleEl =
    document.querySelector(".text-body-medium.break-words") ??
    document.querySelector(".pv-top-card--list .text-body-medium");
  const title = titleEl?.textContent?.trim() ?? null;

  // Company — from experience section or top card
  const companyEl =
    document.querySelector(
      "button[aria-label*='company'] span"
    ) ??
    document.querySelector(".pv-top-card--experience-list-item") ??
    document.querySelector(
      ".experience-item__subtitle"
    );
  const company = companyEl?.textContent?.trim() ?? null;

  // Location
  const locationEl =
    document.querySelector(".text-body-small.inline.t-black--light.break-words") ??
    document.querySelector(".pv-top-card--list-bullet .text-body-small");
  const location = locationEl?.textContent?.trim() ?? null;

  return {
    name,
    title,
    company,
    location,
    linkedinUrl: window.location.href.split("?")[0],
    source: "linkedin",
    leadType: "person",
  };
}

/**
 * Extract multiple leads from LinkedIn search results.
 */
function extractSearchResults(): LinkedInLead[] {
  const leads: LinkedInLead[] = [];
  const cards = document.querySelectorAll(".reusable-search__result-container");

  cards.forEach((card) => {
    const nameEl = card.querySelector(
      ".entity-result__title-text a span[aria-hidden='true']"
    );
    const name = nameEl?.textContent?.trim();
    if (!name || name === "LinkedIn Member") return;

    const titleEl = card.querySelector(".entity-result__primary-subtitle");
    const locationEl = card.querySelector(".entity-result__secondary-subtitle");
    const linkEl = card.querySelector(
      ".entity-result__title-text a"
    ) as HTMLAnchorElement | null;

    leads.push({
      name,
      title: titleEl?.textContent?.trim() ?? null,
      company: null, // Would need to parse from title
      location: locationEl?.textContent?.trim() ?? null,
      linkedinUrl: linkEl?.href?.split("?")[0] ?? "",
      source: "linkedin",
      leadType: "person",
    });
  });

  return leads;
}

export function init(siteType: SiteType) {
  // Wait for page to settle
  setTimeout(() => {
    if (siteType === "linkedin-profile") {
      const lead = extractProfileData();
      if (lead) {
        chrome.runtime.sendMessage({
          type: "LEAD_EXTRACTED",
          payload: { leads: [lead], siteType },
        });
      }
    } else if (siteType === "linkedin-search") {
      const leads = extractSearchResults();
      if (leads.length > 0) {
        chrome.runtime.sendMessage({
          type: "LEAD_EXTRACTED",
          payload: { leads, siteType },
        });
      }
    }
  }, 2000);
}
