/**
 * Autonomous LinkedIn Scraping Agent
 *
 * Uses Puppeteer to scrape LinkedIn search results for people.
 *
 * IMPORTANT: LinkedIn aggressively detects automation.
 * This agent uses careful techniques:
 * - Realistic delays (3-8 seconds between actions)
 * - Human-like scrolling patterns
 * - Requires LinkedIn cookies/session (user must log in first)
 * - Stops after rate limit signals
 * - Only reads public search results, no profile clicking
 *
 * The user must provide their LinkedIn session cookie for this to work.
 * Set LINKEDIN_SESSION_COOKIE in .env (the "li_at" cookie value).
 */

import puppeteer, { type Browser, type Page } from "puppeteer-core";

export interface LinkedInPerson {
  name: string;
  title: string | null;
  company: string | null;
  location: string | null;
  linkedinUrl: string | null;
}

export interface LinkedInScrapeConfig {
  searchUrls: string[];
  maxResultsPerUrl: number;
  ownerId: string;
  delayBetweenMs: number;
}

interface ScrapeProgress {
  status: "running" | "complete" | "failed";
  query: string;
  totalFound: number;
  totalSaved: number;
  errors: string[];
  startedAt: Date;
  completedAt: Date | null;
}

const activeJobs = new Map<string, ScrapeProgress>();

export function getLinkedInJobStatus(jobId: string): ScrapeProgress | null {
  return activeJobs.get(jobId) ?? null;
}

/**
 * Generate LinkedIn People Search URLs from criteria.
 */
export function generateLinkedInSearchUrls(params: {
  titles: string[];
  locations: string[];
  categories: string[];
}): string[] {
  const urls: string[] = [];

  // LinkedIn search URL format
  // We build keyword searches combining title + industry
  const keywords: string[] = [];

  for (const title of params.titles.length > 0 ? params.titles : ["Owner", "CEO", "Founder"]) {
    for (const category of params.categories) {
      keywords.push(`${title} ${category}`);
    }
  }

  for (const keyword of keywords) {
    const encoded = encodeURIComponent(keyword);
    let url = `https://www.linkedin.com/search/results/people/?keywords=${encoded}`;

    // Add location filter if provided
    if (params.locations.length > 0) {
      // LinkedIn uses geoUrn IDs for locations, but keyword search works too
      const locKeyword = params.locations[0];
      url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${keyword} ${locKeyword}`)}`;
    }

    urls.push(url);
  }

  return urls;
}

/**
 * Start a LinkedIn scraping job.
 */
export async function startLinkedInScrapeJob(
  config: LinkedInScrapeConfig,
  onPersonFound: (person: LinkedInPerson) => Promise<void>
): Promise<string> {
  const jobId = `linkedin-${Date.now()}`;
  const sessionCookie = process.env.LINKEDIN_SESSION_COOKIE;

  if (!sessionCookie) {
    throw new Error("LINKEDIN_SESSION_COOKIE not configured. Log into LinkedIn, copy the 'li_at' cookie value, and add it to .env.");
  }

  const progress: ScrapeProgress = {
    status: "running",
    query: "",
    totalFound: 0,
    totalSaved: 0,
    errors: [],
    startedAt: new Date(),
    completedAt: null,
  };
  activeJobs.set(jobId, progress);

  runLinkedInJob(jobId, config, progress, onPersonFound, sessionCookie).catch((err) => {
    progress.status = "failed";
    progress.errors.push(err.message);
    progress.completedAt = new Date();
  });

  return jobId;
}

async function runLinkedInJob(
  jobId: string,
  config: LinkedInScrapeConfig,
  progress: ScrapeProgress,
  onPersonFound: (person: LinkedInPerson) => Promise<void>,
  sessionCookie: string
) {
  let browser: Browser | null = null;

  try {
    const executablePath = await findChromePath();

    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1920,1080"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Set LinkedIn session cookie
    await page.setCookie({
      name: "li_at",
      value: sessionCookie,
      domain: ".linkedin.com",
      path: "/",
      httpOnly: true,
      secure: true,
    });

    for (const url of config.searchUrls) {
      progress.query = url;

      try {
        const people = await scrapeLinkedInSearch(page, url, config.maxResultsPerUrl, config.delayBetweenMs);

        for (const person of people) {
          progress.totalFound++;
          try {
            await onPersonFound(person);
            progress.totalSaved++;
          } catch (err: any) {
            if (!err.message?.includes("already exists")) {
              progress.errors.push(`Save failed for ${person.name}: ${err.message}`);
            }
          }
        }
      } catch (err: any) {
        progress.errors.push(`Search failed: ${err.message}`);
        // If we hit a rate limit, stop entirely
        if (err.message.includes("rate limit") || err.message.includes("challenge")) {
          progress.errors.push("Rate limited by LinkedIn — stopping to protect your account.");
          break;
        }
      }

      // Longer delay between LinkedIn searches (protect the account)
      await delay(5000 + Math.random() * 5000);
    }

    progress.status = "complete";
    progress.completedAt = new Date();
  } catch (err: any) {
    progress.status = "failed";
    progress.errors.push(err.message);
    progress.completedAt = new Date();
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeLinkedInSearch(
  page: Page,
  url: string,
  maxResults: number,
  delayMs: number
): Promise<LinkedInPerson[]> {
  const results: LinkedInPerson[] = [];

  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  await delay(3000);

  // Check if we're on a login page or challenge page
  const currentUrl = page.url();
  if (currentUrl.includes("/login") || currentUrl.includes("/challenge")) {
    throw new Error("LinkedIn session expired or rate limit challenge. Update LINKEDIN_SESSION_COOKIE.");
  }

  // Scroll to load more results
  for (let scroll = 0; scroll < 5; scroll++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await delay(1000 + Math.random() * 1000);
  }

  // Extract people from search results
  const people = await page.evaluate(() => {
    const cards = document.querySelectorAll(".reusable-search__result-container");
    const results: any[] = [];

    cards.forEach((card) => {
      const nameEl = card.querySelector(
        ".entity-result__title-text a span[aria-hidden='true']"
      );
      const name = nameEl?.textContent?.trim();
      if (!name || name === "LinkedIn Member") return;

      const titleEl = card.querySelector(".entity-result__primary-subtitle");
      const locationEl = card.querySelector(".entity-result__secondary-subtitle");
      const linkEl = card.querySelector(".entity-result__title-text a") as HTMLAnchorElement | null;

      // Try to extract company from the title line
      const titleText = titleEl?.textContent?.trim() ?? "";
      let title = titleText;
      let company: string | null = null;

      // Common patterns: "CEO at Company" or "CEO, Company" or "Title | Company"
      const atMatch = titleText.match(/^(.+?)\s+at\s+(.+)$/i);
      const commaMatch = titleText.match(/^(.+?),\s+(.+)$/);
      const pipeMatch = titleText.match(/^(.+?)\s*\|\s*(.+)$/);

      if (atMatch) {
        title = atMatch[1].trim();
        company = atMatch[2].trim();
      } else if (pipeMatch) {
        title = pipeMatch[1].trim();
        company = pipeMatch[2].trim();
      } else if (commaMatch) {
        title = commaMatch[1].trim();
        company = commaMatch[2].trim();
      }

      results.push({
        name,
        title,
        company,
        location: locationEl?.textContent?.trim() ?? null,
        linkedinUrl: linkEl?.href?.split("?")[0] ?? null,
      });
    });

    return results;
  });

  for (const person of people.slice(0, maxResults)) {
    results.push(person);
    await delay(500 + Math.random() * delayMs);
  }

  // Check for next page
  if (results.length < maxResults) {
    const nextButton = await page.$('button[aria-label="Next"]');
    if (nextButton) {
      await nextButton.click();
      await delay(3000 + Math.random() * 2000);

      const morePeople = await scrapeLinkedInSearch(page, page.url(), maxResults - results.length, delayMs);
      results.push(...morePeople);
    }
  }

  return results.slice(0, maxResults);
}

async function findChromePath(): Promise<string> {
  const paths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    process.env.CHROME_PATH,
  ].filter(Boolean) as string[];

  for (const p of paths) {
    try {
      const { access } = await import("fs/promises");
      await access(p);
      return p;
    } catch { /* not found */ }
  }

  throw new Error("Chrome/Chromium not found. Set CHROME_PATH env variable.");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
