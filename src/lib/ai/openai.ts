import OpenAI from "openai";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function generateDraftOpenAI(params: {
  leadName: string;
  leadTitle: string | null;
  leadCompany: string | null;
  leadIndustry: string | null;
  leadSource: string;
  businessProfile?: {
    category: string | null;
    rating: number | null;
    reviewCount: number | null;
    website: string | null;
  } | null;
  automationSignal?: {
    jobTitle: string | null;
    jobDescription: string | null;
    signalStrength: string;
  } | null;
  channel: string;
  agentConfig?: {
    agencyDescription: string | null;
    targetIndustries: string | null;
    tone: string;
    differentiators: string | null;
    systemPrompt: string | null;
  } | null;
  model?: string;
}) {
  const {
    leadName,
    leadTitle,
    leadCompany,
    leadIndustry,
    leadSource,
    businessProfile,
    automationSignal,
    channel,
    agentConfig,
    model = "o4-mini",
  } = params;

  const systemPrompt = agentConfig?.systemPrompt ?? buildDefaultSystemPrompt(agentConfig);

  let leadContext = `Lead: ${leadName}`;
  if (leadTitle) leadContext += `\nTitle: ${leadTitle}`;
  if (leadCompany) leadContext += `\nCompany: ${leadCompany}`;
  if (leadIndustry) leadContext += `\nIndustry: ${leadIndustry}`;
  leadContext += `\nSource: ${leadSource}`;

  if (businessProfile) {
    if (businessProfile.category) leadContext += `\nBusiness category: ${businessProfile.category}`;
    if (businessProfile.rating) leadContext += `\nRating: ${businessProfile.rating}/5 (${businessProfile.reviewCount} reviews)`;
    if (businessProfile.website) leadContext += `\nWebsite: ${businessProfile.website}`;
  }

  if (automationSignal) {
    leadContext += `\n\nAutomation Signal: This company is hiring for "${automationSignal.jobTitle}"`;
    leadContext += `\nSignal strength: ${automationSignal.signalStrength}`;
    if (automationSignal.jobDescription) {
      leadContext += `\nJob description excerpt: ${automationSignal.jobDescription.slice(0, 500)}`;
    }
  }

  const channelInstructions: Record<string, string> = {
    email: "Write a cold email. Include a subject line on the first line prefixed with 'Subject: '. Keep it under 150 words. Include a clear CTA.",
    linkedin: "Write a LinkedIn connection request message. Maximum 300 characters. Be concise and personal.",
    sms: "Write an SMS message. Maximum 160 characters. Direct and casual.",
    twitter: "Write a Twitter/X DM. Maximum 280 characters. Conversational tone.",
  };

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${leadContext}\n\nChannel: ${channel}\n\n${channelInstructions[channel] ?? channelInstructions.email}\n\nDraft a personalized outreach message for this lead. Focus on how AI automation can solve their specific pain points based on the context above.`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "";

  let subject: string | null = null;
  let body = content;
  if (channel === "email") {
    const subjectMatch = content.match(/^Subject:\s*(.+)\n/);
    if (subjectMatch) {
      subject = subjectMatch[1].trim();
      body = content.replace(/^Subject:\s*.+\n\n?/, "").trim();
    }
  }

  return {
    content: body,
    subject,
    modelUsed: model,
  };
}

function buildDefaultSystemPrompt(
  agentConfig?: {
    agencyDescription: string | null;
    targetIndustries: string | null;
    tone: string;
    differentiators: string | null;
  } | null
): string {
  const desc = agentConfig?.agencyDescription ?? "an AI automation agency";
  const tone = agentConfig?.tone ?? "professional";
  const diff = agentConfig?.differentiators ?? "custom AI solutions tailored to each client's needs";

  return `You are an outreach specialist for ${desc}. Your tone is ${tone}.

Key differentiators: ${diff}

Rules:
- Be concise and specific — reference details from the lead's profile
- For Google Maps businesses: reference their reviews, rating, or category to show you've done research
- For job board leads: reference the specific job posting and explain how AI automation could replace or augment that role
- Never be pushy or use spam language ("limited time", "act now", etc.)
- Include one clear call-to-action
- Sound human, not like a template
- For email: always include a subject line
- Respect character limits for each channel`;
}
