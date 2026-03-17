// ── Shared types for the extension ──

export interface LinkedInLead {
  name: string;
  title: string | null;
  company: string | null;
  location: string | null;
  linkedinUrl: string;
  source: "linkedin";
  leadType: "person";
}

export interface GoogleMapsLead {
  name: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  category: string | null;
  googleMapsUrl: string;
  source: "gmaps";
  leadType: "business";
}

export interface JobBoardLead {
  company: string;
  jobTitle: string;
  jobDescription: string | null;
  jobUrl: string;
  source: "jobboard";
  leadType: "person";
  signalType: "hiring-repetitive-role";
  signalStrength: "low" | "medium" | "high";
}

export type ExtractedLead = LinkedInLead | GoogleMapsLead | JobBoardLead;

export interface SaveLeadRequest {
  lead: ExtractedLead;
}

export interface ExtensionMessage {
  type: "LEAD_EXTRACTED" | "SAVE_LEAD" | "GET_AUTH_TOKEN" | "OPEN_SIDEPANEL";
  payload?: any;
}

export type SiteType =
  | "linkedin-profile"
  | "linkedin-search"
  | "linkedin-jobs"
  | "gmaps-listing"
  | "gmaps-search"
  | "indeed-job"
  | "indeed-search"
  | "unknown";
