/**
 * BBB (Better Business Bureau) Scraper
 *
 * Searches BBB for businesses by category + location.
 * Extracts: name, BBB rating (A+ to F), accreditation status,
 * complaints count, phone, website.
 */

import puppeteer from "puppeteer-core";

export interface BBBBusiness {
  name: string;
  bbbRating: string | null; // A+, A, A-, B+, B, etc.
  isAccredited: boolean;
  complaintsCount: number | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  category: string | null;
  bbbUrl: string;
  source: "bbb";
}

export async function scrapeBBB(params: {
  category: string;
  location: string;
  maxResults?: number;
}): Promise<BBBBusiness[]> {
  const { category, location, maxResults = 20 } = params;
  const results: BBBBusiness[] = [];

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ??
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    );

    // Navigate to BBB search
    const searchUrl = `https://www.bbb.org/search?find_country=US&find_text=${encodeURIComponent(category)}&find_loc=${encodeURIComponent(location)}&find_type=Category`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for results
    await page.waitForSelector(".search-results", { timeout: 10000 }).catch(() => {});

    // Extract listings
    const businesses = await page.evaluate(() => {
      const items: any[] = [];
      const cards = document.querySelectorAll(".result-item, .search-result-item, [data-testid='search-result']");

      cards.forEach((card) => {
        const nameEl = card.querySelector("h3 a, .result-name a, a.business-name");
        const ratingEl = card.querySelector(".bbb-rating, .rating-letter, [class*='rating']");
        const accreditedEl = card.querySelector(".accredited, [class*='accredited']");
        const phoneEl = card.querySelector(".phone, a[href^='tel:']");
        const addressEl = card.querySelector(".address, .location");
        const categoryEl = card.querySelector(".category, .business-category");
        const linkEl = nameEl as HTMLAnchorElement;

        items.push({
          name: nameEl?.textContent?.trim() ?? "",
          bbbRating: ratingEl?.textContent?.trim()?.match(/[A-F][+-]?/)?.[0] ?? null,
          isAccredited: !!accreditedEl || card.textContent?.includes("BBB Accredited") === true,
          phone: phoneEl?.textContent?.trim() ?? null,
          address: addressEl?.textContent?.trim() ?? null,
          category: categoryEl?.textContent?.trim() ?? null,
          bbbUrl: linkEl?.href ?? "",
        });
      });

      return items;
    });

    const limited = businesses.slice(0, maxResults);

    // Get additional details from individual pages (first 5)
    for (const biz of limited.slice(0, 5)) {
      if (!biz.bbbUrl || !biz.name) continue;

      try {
        await page.goto(biz.bbbUrl, { waitUntil: "networkidle2", timeout: 15000 });
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));

        const details = await page.evaluate(() => {
          const websiteEl = document.querySelector('a[class*="website"], a[href*="://"][target="_blank"]') as HTMLAnchorElement;
          const complaintsEl = document.querySelector('[class*="complaints"] .count, .complaint-count');
          const phoneEl = document.querySelector('a[href^="tel:"]');
          return {
            website: websiteEl?.href ?? null,
            complaintsCount: complaintsEl
              ? parseInt(complaintsEl.textContent?.match(/\d+/)?.[0] ?? "0", 10)
              : null,
            phone: phoneEl?.textContent?.trim() ?? null,
          };
        });

        results.push({
          ...biz,
          website: details.website,
          complaintsCount: details.complaintsCount,
          phone: details.phone ?? biz.phone,
          source: "bbb",
        });
      } catch {
        results.push({ ...biz, website: null, complaintsCount: null, source: "bbb" });
      }
    }

    // Add remaining
    for (const biz of limited.slice(5)) {
      results.push({ ...biz, website: null, complaintsCount: null, source: "bbb" });
    }
  } catch (err) {
    console.error("BBB scrape error:", err);
  } finally {
    await browser?.close();
  }

  return results;
}
