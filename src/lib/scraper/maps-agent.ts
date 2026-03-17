/**
 * Autonomous Google Maps Scraping Agent
 *
 * Uses Puppeteer to autonomously:
 * 1. Generate search queries from ICP criteria
 * 2. Navigate Google Maps search results
 * 3. Click into each listing and extract full business data
 * 4. Auto-save leads to the database
 * 5. Auto-trigger enrichment for each lead
 *
 * Designed to be polite: random delays, respectful rate limiting.
 */

import puppeteer, { type Browser, type Page } from "puppeteer-core";

export interface ScrapeConfig {
  queries: string[];           // e.g., ["dentists in Toronto", "real estate agents Vancouver"]
  maxResultsPerQuery: number;  // default: 20
  ownerId: string;
  delayBetweenMs: number;      // default: 2000-4000 (randomized)
}

export interface ScrapedBusiness {
  name: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  category: string | null;
  googleMapsUrl: string;
}

export interface ScrapeProgress {
  status: "running" | "complete" | "failed";
  query: string;
  totalFound: number;
  totalSaved: number;
  errors: string[];
  startedAt: Date;
  completedAt: Date | null;
}

// Store active scrape jobs
const activeJobs = new Map<string, ScrapeProgress>();

export function getJobStatus(jobId: string): ScrapeProgress | null {
  return activeJobs.get(jobId) ?? null;
}

/**
 * Generate Google Maps search queries from ICP criteria.
 */
export function generateSearchQueries(params: {
  categories: string[];
  locations: string[];
}): string[] {
  const queries: string[] = [];

  for (const category of params.categories) {
    if (params.locations.length === 0) {
      queries.push(category);
    } else {
      for (const location of params.locations) {
        queries.push(`${category} in ${location}`);
      }
    }
  }

  return queries;
}

/**
 * Launch the scraping agent.
 * Returns a job ID that can be polled for status.
 */
export async function startScrapeJob(
  config: ScrapeConfig,
  onLeadFound: (lead: ScrapedBusiness) => Promise<void>
): Promise<string> {
  const jobId = `scrape-${Date.now()}`;

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

  // Run in background (non-blocking)
  runScrapeJob(jobId, config, progress, onLeadFound).catch((err) => {
    progress.status = "failed";
    progress.errors.push(err.message);
    progress.completedAt = new Date();
  });

  return jobId;
}

async function runScrapeJob(
  jobId: string,
  config: ScrapeConfig,
  progress: ScrapeProgress,
  onLeadFound: (lead: ScrapedBusiness) => Promise<void>
) {
  let browser: Browser | null = null;

  try {
    // Find Chrome/Chromium executable
    const executablePath = await findChromePath();

    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1920,1080",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    for (const query of config.queries) {
      progress.query = query;

      try {
        const businesses = await scrapeGoogleMapsQuery(
          page,
          query,
          config.maxResultsPerQuery,
          config.delayBetweenMs
        );

        for (const biz of businesses) {
          progress.totalFound++;
          try {
            await onLeadFound(biz);
            progress.totalSaved++;
          } catch (err: any) {
            if (!err.message?.includes("already exists")) {
              progress.errors.push(`Save failed for ${biz.name}: ${err.message}`);
            }
          }
        }
      } catch (err: any) {
        progress.errors.push(`Query "${query}" failed: ${err.message}`);
      }

      // Delay between queries
      await delay(3000 + Math.random() * 2000);
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

/**
 * Scrape a single Google Maps search query.
 */
async function scrapeGoogleMapsQuery(
  page: Page,
  query: string,
  maxResults: number,
  delayMs: number
): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const encoded = encodeURIComponent(query);

  await page.goto(`https://www.google.com/maps/search/${encoded}/`, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });

  // Wait for results to load
  await delay(3000);

  // Scroll the results panel to load more
  const resultsPanel = await page.$('div[role="feed"]');
  if (!resultsPanel) return results;

  // Scroll to load results
  let previousCount = 0;
  for (let scroll = 0; scroll < 10; scroll++) {
    await page.evaluate((el) => {
      if (el) el.scrollTop = el.scrollHeight;
    }, resultsPanel);
    await delay(1500);

    const currentCount = await page.$$eval(
      'div[role="feed"] > div > div > a',
      (els) => els.length
    );

    if (currentCount >= maxResults || currentCount === previousCount) break;
    previousCount = currentCount;
  }

  // Get all listing links
  const listingLinks = await page.$$eval(
    'div[role="feed"] > div > div > a[href*="/maps/place/"]',
    (els) => els.map((el) => (el as HTMLAnchorElement).href).slice(0, 50)
  );

  // Click into each listing and extract data
  for (const link of listingLinks.slice(0, maxResults)) {
    try {
      await page.goto(link, { waitUntil: "networkidle2", timeout: 20000 });
      await delay(1500 + Math.random() * delayMs);

      const business = await extractListingData(page);
      if (business) {
        results.push(business);
      }
    } catch {
      // Skip failed listings
    }
  }

  return results;
}

/**
 * Extract business data from a Google Maps listing page.
 */
async function extractListingData(page: Page): Promise<ScrapedBusiness | null> {
  return page.evaluate(() => {
    const nameEl = document.querySelector("h1.DUwDvf") ?? document.querySelector("h1");
    const name = nameEl?.textContent?.trim();
    if (!name) return null;

    // Rating
    const ratingEl = document.querySelector("div.F7nice span[aria-hidden='true']");
    const rating = ratingEl ? parseFloat(ratingEl.textContent?.trim() ?? "") : null;

    // Review count
    const reviewEl = document.querySelector("div.F7nice span[aria-label*='review']");
    const reviewText = reviewEl?.getAttribute("aria-label") ?? "";
    const reviewMatch = reviewText.match(/([\d,]+)\s*review/);
    const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, "")) : null;

    // Category
    const categoryEl = document.querySelector("button.DkEaL");
    const category = categoryEl?.textContent?.trim() ?? null;

    // Address
    const addressEl = document.querySelector("[data-item-id='address'] .Io6YTe") ??
      document.querySelector("button[data-item-id='address']");
    const address = addressEl?.textContent?.trim() ?? null;

    // Phone
    const phoneEl = document.querySelector("[data-item-id^='phone'] .Io6YTe") ??
      document.querySelector("button[data-item-id^='phone']");
    const phone = phoneEl?.textContent?.trim() ?? null;

    // Website
    const websiteEl = document.querySelector("[data-item-id='authority'] a") as HTMLAnchorElement | null;
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
    };
  });
}

/**
 * Find the Chrome/Chromium executable path.
 */
async function findChromePath(): Promise<string> {
  const paths = [
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    // Custom env
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
