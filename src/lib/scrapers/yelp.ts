/**
 * Yelp Business Scraper
 *
 * Searches Yelp for businesses by category + location.
 * Extracts: name, rating, review count, phone, website, address, category, price range.
 */

import puppeteer from "puppeteer-core";

export interface YelpBusiness {
  name: string;
  rating: number | null;
  reviewCount: number | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  category: string | null;
  priceRange: string | null;
  yelpUrl: string;
  source: "yelp";
}

export async function scrapeYelp(params: {
  category: string;
  location: string;
  maxResults?: number;
}): Promise<YelpBusiness[]> {
  const { category, location, maxResults = 20 } = params;
  const results: YelpBusiness[] = [];

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

    // Navigate to Yelp search
    const searchUrl = `https://www.yelp.com/search?find_desc=${encodeURIComponent(category)}&find_loc=${encodeURIComponent(location)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for results to load
    await page.waitForSelector('[data-testid="serp-ia-card"]', { timeout: 10000 }).catch(() => {});

    // Extract business listings
    const businesses = await page.evaluate(() => {
      const items: any[] = [];
      const cards = document.querySelectorAll('[data-testid="serp-ia-card"]');

      cards.forEach((card) => {
        const nameEl = card.querySelector("a[href*='/biz/'] h3, a[href*='/biz/'] span");
        const ratingEl = card.querySelector('[aria-label*="star rating"]');
        const reviewEl = card.querySelector('span[class*="reviewCount"]');
        const categoryEl = card.querySelector('span[class*="category"], p[class*="category"]');
        const priceEl = card.querySelector('span[class*="priceRange"]');
        const addressEl = card.querySelector('span[class*="secondaryAttributes"], address');
        const linkEl = card.querySelector('a[href*="/biz/"]') as HTMLAnchorElement;

        items.push({
          name: nameEl?.textContent?.trim() ?? "",
          rating: ratingEl
            ? parseFloat(ratingEl.getAttribute("aria-label")?.match(/[\d.]+/)?.[0] ?? "0")
            : null,
          reviewCount: reviewEl
            ? parseInt(reviewEl.textContent?.match(/\d+/)?.[0] ?? "0", 10)
            : null,
          category: categoryEl?.textContent?.trim() ?? null,
          priceRange: priceEl?.textContent?.trim() ?? null,
          address: addressEl?.textContent?.trim() ?? null,
          yelpUrl: linkEl?.href ?? "",
        });
      });

      return items;
    });

    // Limit results
    const limited = businesses.slice(0, maxResults);

    // Get phone/website from individual pages (first 10 to avoid rate limiting)
    for (const biz of limited.slice(0, 10)) {
      if (!biz.yelpUrl || !biz.name) continue;

      try {
        await page.goto(biz.yelpUrl, { waitUntil: "networkidle2", timeout: 15000 });
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));

        const details = await page.evaluate(() => {
          const phoneEl = document.querySelector('p[class*="phone"], a[href^="tel:"]');
          const websiteEl = document.querySelector('a[href*="biz_redir"]') as HTMLAnchorElement;
          return {
            phone: phoneEl?.textContent?.trim() ?? null,
            website: websiteEl?.href ?? null,
          };
        });

        results.push({
          ...biz,
          phone: details.phone,
          website: details.website,
          source: "yelp",
        });
      } catch {
        results.push({ ...biz, phone: null, website: null, source: "yelp" });
      }
    }

    // Add remaining without phone/website details
    for (const biz of limited.slice(10)) {
      results.push({ ...biz, phone: null, website: null, source: "yelp" });
    }
  } catch (err) {
    console.error("Yelp scrape error:", err);
  } finally {
    await browser?.close();
  }

  return results;
}
