/**
 * LinkedIn Action Definitions
 *
 * These define what the Chrome extension can execute on LinkedIn.
 * The extension receives action commands via polling and executes them
 * by manipulating the LinkedIn DOM.
 *
 * Actions:
 * - visit: Navigate to profile (triggers "someone viewed your profile")
 * - connect: Send connection request with optional message
 * - message: Send direct message to 1st-degree connection
 * - inmail: Send InMail to 2nd/3rd-degree connection
 * - endorse: Endorse top skills on profile
 * - like: Like the prospect's most recent post
 * - follow: Follow the profile
 * - tag: Apply a tag (stored in our DB, not LinkedIn)
 */

export type LinkedInActionType =
  | "visit"
  | "connect"
  | "message"
  | "inmail"
  | "endorse"
  | "like"
  | "follow"
  | "tag";

export interface LinkedInAction {
  id: string;
  type: LinkedInActionType;
  prospectId: string;
  linkedinUrl: string;
  /** Personalized message (markers already substituted) */
  message?: string;
  /** InMail subject */
  subject?: string;
  /** Tag to apply */
  tag?: string;
}

export interface ActionResult {
  actionId: string;
  success: boolean;
  error?: string;
  /** New connection status after action */
  connectionStatus?: "none" | "pending" | "connected";
  /** Data extracted during action (e.g., profile data from visit) */
  extractedData?: Record<string, any>;
}

/**
 * Substitute personalization markers in a message template.
 *
 * Markers:
 * _FN_ = First name
 * _LN_ = Last name
 * _CN_ = Company name
 * _TITLE_ = Job title
 * _FULLNAME_ = Full name
 */
export function personalizeMessage(
  template: string,
  prospect: {
    name: string;
    title?: string | null;
    company?: string | null;
  }
): string {
  const nameParts = prospect.name.split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") ?? "";

  return template
    .replace(/_FN_/g, firstName)
    .replace(/_LN_/g, lastName)
    .replace(/_FULLNAME_/g, prospect.name)
    .replace(/_CN_/g, prospect.company ?? "your company")
    .replace(/_TITLE_/g, prospect.title ?? "");
}

/**
 * Daily limits per LinkedIn account type.
 * Conservative defaults to avoid account restrictions.
 */
export const ACCOUNT_LIMITS: Record<string, {
  visits: number;
  connections: number;
  messages: number;
  inmails: number;
  endorsements: number;
  likes: number;
}> = {
  free: {
    visits: 50,
    connections: 10,
    messages: 25,
    inmails: 0,
    endorsements: 10,
    likes: 20,
  },
  premium: {
    visits: 100,
    connections: 20,
    messages: 50,
    inmails: 15,
    endorsements: 20,
    likes: 40,
  },
  sales_navigator: {
    visits: 200,
    connections: 25,
    messages: 75,
    inmails: 50,
    endorsements: 30,
    likes: 60,
  },
  recruiter: {
    visits: 400,
    connections: 30,
    messages: 100,
    inmails: 100,
    endorsements: 40,
    likes: 80,
  },
};

/**
 * Calculate random delay between actions (human-like).
 * Returns delay in milliseconds.
 */
export function getRandomDelay(actionType: LinkedInActionType): number {
  // Base delays per action type (in ms)
  const baseDelays: Record<LinkedInActionType, [number, number]> = {
    visit: [8000, 20000],       // 8-20 seconds between visits
    connect: [15000, 45000],    // 15-45 seconds between connections
    message: [20000, 60000],    // 20-60 seconds between messages
    inmail: [30000, 90000],     // 30-90 seconds between inmails
    endorse: [5000, 15000],     // 5-15 seconds between endorsements
    like: [3000, 10000],        // 3-10 seconds between likes
    follow: [5000, 12000],      // 5-12 seconds between follows
    tag: [0, 0],                // Instant (tag is local, not LinkedIn)
  };

  const [min, max] = baseDelays[actionType];
  return min + Math.random() * (max - min);
}

/**
 * Should take a break? (5 min pause after every 20 actions)
 */
export function shouldTakeBreak(actionsExecuted: number): boolean {
  return actionsExecuted > 0 && actionsExecuted % 20 === 0;
}

export const BREAK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
