import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { aiComplete, parseAIJson } from "@/lib/ai/provider";
import {
  startLinkedInScrapeJob,
  generateLinkedInSearchUrls,
} from "@/lib/scraper/linkedin-agent";

/**
 * POST /api/search/people — Search for specific people by name/title/company.
 * Like Apollo's contact database but powered by live scraping.
 */
export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { name, title, company, location, industry } = body;

  if (!title && !company && !name) {
    return NextResponse.json(
      { error: "Provide at least a name, title, or company" },
      { status: 400 }
    );
  }

  // Build search parameters
  const titles = title ? [title] : [];
  const categories = industry ? [industry] : company ? [company] : [];
  const locations = location ? [location] : [];

  const searchUrls = generateLinkedInSearchUrls({
    titles,
    locations,
    categories,
  });

  // Start LinkedIn scrape
  const results: any[] = [];
  const jobId = await startLinkedInScrapeJob(
    {
      searchUrls,
      maxResultsPerUrl: 25,
      ownerId: userId,
      delayBetweenMs: 3000,
    },
    async (person) => {
      // Filter by name if specified
      if (name && !person.name.toLowerCase().includes(name.toLowerCase())) {
        return;
      }

      results.push({
        name: person.name,
        title: person.title,
        company: person.company,
        location: person.location,
        linkedinUrl: person.linkedinUrl,
      });
    }
  );

  return NextResponse.json({
    jobId,
    message: `Searching for people matching: ${[name, title, company, location].filter(Boolean).join(", ")}`,
    initialResults: results,
  });
}
