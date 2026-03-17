import type { GoogleMapsLead, SiteType } from "../lib/types";

/**
 * Extract business data from a Google Maps place/listing page.
 * Reads the visible DOM — no automated actions.
 */
function extractListingData(): GoogleMapsLead | null {
  // Business name — the main heading
  const nameEl =
    document.querySelector("h1.DUwDvf") ??
    document.querySelector("[data-attrid='title'] span") ??
    document.querySelector("h1");
  const name = nameEl?.textContent?.trim();
  if (!name) return null;

  // Rating
  const ratingEl = document.querySelector(
    "div.F7nice span[aria-hidden='true']"
  );
  const rating = ratingEl ? parseFloat(ratingEl.textContent?.trim() ?? "") : null;

  // Review count
  const reviewEl = document.querySelector(
    "div.F7nice span[aria-label*='review']"
  );
  const reviewText = reviewEl?.getAttribute("aria-label") ?? "";
  const reviewMatch = reviewText.match(/([\d,]+)\s*review/);
  const reviewCount = reviewMatch
    ? parseInt(reviewMatch[1].replace(/,/g, ""))
    : null;

  // Category
  const categoryEl = document.querySelector(
    "button.DkEaL"
  );
  const category = categoryEl?.textContent?.trim() ?? null;

  // Address
  const addressEl = document.querySelector(
    "[data-item-id='address'] .Io6YTe"
  ) ?? document.querySelector("button[data-item-id='address']");
  const address = addressEl?.textContent?.trim() ?? null;

  // Phone
  const phoneEl = document.querySelector(
    "[data-item-id^='phone'] .Io6YTe"
  ) ?? document.querySelector("button[data-item-id^='phone']");
  const phone = phoneEl?.textContent?.trim() ?? null;

  // Website
  const websiteEl = document.querySelector(
    "[data-item-id='authority'] a"
  ) as HTMLAnchorElement | null;
  const website = websiteEl?.href ?? null;

  return {
    name,
    phone,
    website,
    address,
    rating: isNaN(rating as number) ? null : rating,
    reviewCount,
    category,
    googleMapsUrl: window.location.href,
    source: "gmaps",
    leadType: "business",
  };
}

/**
 * Extract multiple businesses from Google Maps search results.
 */
function extractSearchResults(): GoogleMapsLead[] {
  const leads: GoogleMapsLead[] = [];
  const items = document.querySelectorAll(
    "div.Nv2PK"
  );

  items.forEach((item) => {
    const nameEl = item.querySelector(".qBF1Pd");
    const name = nameEl?.textContent?.trim();
    if (!name) return;

    const ratingEl = item.querySelector("span.MW4etd");
    const rating = ratingEl ? parseFloat(ratingEl.textContent?.trim() ?? "") : null;

    const reviewEl = item.querySelector("span.UY7F9");
    const reviewText = reviewEl?.textContent?.trim() ?? "";
    const reviewMatch = reviewText.match(/\(([\d,]+)\)/);
    const reviewCount = reviewMatch
      ? parseInt(reviewMatch[1].replace(/,/g, ""))
      : null;

    const categoryEl = item.querySelector(".W4Efsd .W4Efsd:first-child span:first-child");
    const category = categoryEl?.textContent?.trim() ?? null;

    const linkEl = item.querySelector("a.hfpxzc") as HTMLAnchorElement | null;

    leads.push({
      name,
      phone: null,
      website: null,
      address: null,
      rating: isNaN(rating as number) ? null : rating,
      reviewCount,
      category,
      googleMapsUrl: linkEl?.href ?? "",
      source: "gmaps",
      leadType: "business",
    });
  });

  return leads;
}

export function init(siteType: SiteType) {
  setTimeout(() => {
    if (siteType === "gmaps-listing") {
      const lead = extractListingData();
      if (lead) {
        chrome.runtime.sendMessage({
          type: "LEAD_EXTRACTED",
          payload: { leads: [lead], siteType },
        });
      }
    } else if (siteType === "gmaps-search") {
      const leads = extractSearchResults();
      if (leads.length > 0) {
        chrome.runtime.sendMessage({
          type: "LEAD_EXTRACTED",
          payload: { leads, siteType },
        });
      }
    }
  }, 2500);
}
