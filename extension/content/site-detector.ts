import { init as initLinkedin } from "./linkedin-parser";
import { init as initGmaps } from "./gmaps-parser";
import { init as initJobs } from "./jobs-parser";
import type { SiteType } from "../lib/types";

function detectSiteType(): SiteType {
  const url = window.location.href;

  if (url.includes("linkedin.com/in/")) return "linkedin-profile";
  if (url.includes("linkedin.com/search/")) return "linkedin-search";
  if (url.includes("linkedin.com/jobs/")) return "linkedin-jobs";
  if (url.match(/google\.com\/maps\/place\//)) return "gmaps-listing";
  if (url.match(/google\.com\/maps\/search\//)) return "gmaps-search";
  if (url.includes("indeed.com/viewjob")) return "indeed-job";
  if (url.includes("indeed.com/jobs")) return "indeed-search";

  return "unknown";
}

function loadParser(siteType: SiteType) {
  switch (siteType) {
    case "linkedin-profile":
    case "linkedin-search":
      initLinkedin(siteType);
      break;
    case "gmaps-listing":
    case "gmaps-search":
      initGmaps(siteType);
      break;
    case "indeed-job":
    case "indeed-search":
    case "linkedin-jobs":
      initJobs(siteType);
      break;
  }
}

const siteType = detectSiteType();
if (siteType !== "unknown") {
  loadParser(siteType);
}

let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    const newSiteType = detectSiteType();
    if (newSiteType !== "unknown") {
      loadParser(newSiteType);
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
