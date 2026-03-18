/**
 * Email Verification
 *
 * Uses multiple methods to verify if an email exists:
 * 1. API-based verification (works on cloud/serverless)
 * 2. DNS MX lookup (fast, always works)
 * 3. SMTP handshake (fallback, blocked on most cloud providers)
 *
 * Port 25 is blocked on Railway, Vercel, AWS, etc.
 * So we rely on DNS + pattern confidence + Hunter.io verification.
 */

import { promises as dns } from "dns";
import { Socket } from "net";

export interface VerificationResult {
  email: string;
  exists: boolean | null; // null = inconclusive
  isCatchAll: boolean;
  mxHost: string | null;
  smtpResponse: string | null;
  error: string | null;
}

/**
 * Look up MX records for a domain.
 */
async function getMxHost(domain: string): Promise<string | null> {
  try {
    const records = await dns.resolveMx(domain);
    if (!records.length) return null;
    records.sort((a, b) => a.priority - b.priority);
    return records[0].exchange;
  } catch {
    return null;
  }
}

/**
 * Check if a domain can receive email at all (has MX records).
 * This is fast and reliable — works everywhere.
 */
async function domainCanReceiveEmail(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

/**
 * Detect common email providers that are always catch-all or always valid.
 */
function getProviderInfo(domain: string): {
  isKnownProvider: boolean;
  isCatchAll: boolean;
  trustPattern: boolean;
} {
  const knownProviders: Record<string, { isCatchAll: boolean; trustPattern: boolean }> = {
    "gmail.com": { isCatchAll: false, trustPattern: false },
    "outlook.com": { isCatchAll: false, trustPattern: false },
    "yahoo.com": { isCatchAll: false, trustPattern: false },
    "hotmail.com": { isCatchAll: false, trustPattern: false },
  };

  // Company domains on Google Workspace or Microsoft 365 — pattern emails are reliable
  const googleWorkspaceIndicators = [
    "aspmx.l.google.com",
    "google.com",
    "googlemail.com",
  ];
  const microsoftIndicators = [
    "outlook.com",
    "protection.outlook.com",
    "mail.protection.outlook.com",
  ];

  if (knownProviders[domain]) {
    return {
      isKnownProvider: true,
      ...knownProviders[domain],
    };
  }

  return { isKnownProvider: false, isCatchAll: false, trustPattern: true };
}

/**
 * Try to verify via Hunter.io's email verifier (if API key available).
 */
async function verifyViaHunter(email: string): Promise<{
  exists: boolean | null;
  score: number | null;
}> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return { exists: null, score: null };

  try {
    const res = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return { exists: null, score: null };

    const data = await res.json();
    const result = data.data?.result;
    const score = data.data?.score ?? null;

    if (result === "deliverable") return { exists: true, score };
    if (result === "undeliverable") return { exists: false, score };
    return { exists: null, score };
  } catch {
    return { exists: null, score: null };
  }
}

/**
 * SMTP handshake verification.
 * This may fail on cloud providers that block port 25.
 */
async function smtpVerify(
  email: string,
  mxHost: string
): Promise<{ exists: boolean | null; response: string }> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let lastResponse = "";

    const cleanup = () => {
      try {
        socket.write("QUIT\r\n");
        socket.end();
        socket.destroy();
      } catch {}
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve({ exists: null, response: "Connection timeout (port 25 likely blocked)" });
    }, 8000); // Reduced timeout since it often fails on cloud

    socket.connect(25, mxHost, async () => {
      try {
        lastResponse = await smtpCommand(socket, "");
        lastResponse = await smtpCommand(socket, "EHLO scraped.io");
        lastResponse = await smtpCommand(socket, "MAIL FROM:<verify@scraped.io>");
        lastResponse = await smtpCommand(socket, `RCPT TO:<${email}>`);

        clearTimeout(timeout);
        cleanup();

        const code = parseInt(lastResponse.substring(0, 3));
        if (code === 250) resolve({ exists: true, response: lastResponse.trim() });
        else if (code === 550 || code === 551 || code === 553) resolve({ exists: false, response: lastResponse.trim() });
        else resolve({ exists: null, response: lastResponse.trim() });
      } catch (err: any) {
        clearTimeout(timeout);
        cleanup();
        resolve({ exists: null, response: err.message });
      }
    });

    socket.on("error", () => {
      clearTimeout(timeout);
      resolve({ exists: null, response: "Connection failed (port 25 blocked)" });
    });
  });
}

function smtpCommand(socket: Socket, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("SMTP timeout")), 8000);
    socket.once("data", (data) => { clearTimeout(timeout); resolve(data.toString()); });
    socket.once("error", (err) => { clearTimeout(timeout); reject(err); });
    if (command) socket.write(command + "\r\n");
  });
}

/**
 * Verify a single email address.
 * Uses multiple methods for reliability on cloud infrastructure.
 */
export async function verifyEmail(email: string): Promise<VerificationResult> {
  const domain = email.split("@")[1];
  if (!domain) {
    return { email, exists: false, isCatchAll: false, mxHost: null, smtpResponse: null, error: "Invalid email format" };
  }

  // Step 1: DNS MX lookup (fast, always works)
  const mxHost = await getMxHost(domain);
  if (!mxHost) {
    return { email, exists: false, isCatchAll: false, mxHost: null, smtpResponse: null, error: "No MX records — domain cannot receive email" };
  }

  // Step 2: Try Hunter.io API verification first (works on cloud)
  const hunterResult = await verifyViaHunter(email);
  if (hunterResult.exists !== null) {
    return {
      email,
      exists: hunterResult.exists,
      isCatchAll: false,
      mxHost,
      smtpResponse: `Hunter.io: ${hunterResult.exists ? "deliverable" : "undeliverable"} (score: ${hunterResult.score})`,
      error: null,
    };
  }

  // Step 3: Try SMTP (may fail on cloud providers)
  const smtpResult = await smtpVerify(email, mxHost);
  if (smtpResult.exists !== null) {
    return {
      email,
      exists: smtpResult.exists,
      isCatchAll: false,
      mxHost,
      smtpResponse: smtpResult.response,
      error: null,
    };
  }

  // Step 4: If both failed, use domain intelligence
  // Domain has valid MX records, so email format is plausible
  // Mark as inconclusive but with the MX info
  return {
    email,
    exists: null,
    isCatchAll: false,
    mxHost,
    smtpResponse: smtpResult.response,
    error: null,
  };
}

/**
 * Verify multiple email candidates and return ranked results.
 * Enhanced: when SMTP is blocked, use confidence scoring based on pattern likelihood.
 */
export async function verifyEmailBatch(
  candidates: { email: string; pattern: string }[]
): Promise<(VerificationResult & { pattern: string })[]> {
  const results: (VerificationResult & { pattern: string })[] = [];

  // First check if the domain even has MX records
  if (candidates.length > 0) {
    const domain = candidates[0].email.split("@")[1];
    const canReceive = await domainCanReceiveEmail(domain);
    if (!canReceive) {
      return candidates.map((c) => ({
        email: c.email,
        exists: false,
        isCatchAll: false,
        mxHost: null,
        smtpResponse: null,
        error: "Domain has no MX records",
        pattern: c.pattern,
      }));
    }
  }

  // Try to verify the top 3 most likely patterns
  // (first.last@, first@, firstlast@ are the most common)
  for (let i = 0; i < Math.min(candidates.length, 4); i++) {
    const candidate = candidates[i];
    const result = await verifyEmail(candidate.email);
    results.push({ ...result, pattern: candidate.pattern });

    // If verified, stop
    if (result.exists === true) break;

    // If first pattern returns "no MX" or definitive false, domain doesn't work — stop
    if (result.exists === false && result.error?.includes("No MX")) break;
  }

  // If no verification succeeded (SMTP blocked + no Hunter), add remaining patterns
  // with confidence based on pattern frequency
  const hasVerified = results.some((r) => r.exists === true);
  if (!hasVerified) {
    const mxHost = results[0]?.mxHost ?? null;
    // Domain has MX but we couldn't verify — add top patterns as "likely valid"
    for (let i = results.length; i < Math.min(candidates.length, 5); i++) {
      results.push({
        email: candidates[i].email,
        exists: null, // Inconclusive — but domain can receive email
        isCatchAll: false,
        mxHost,
        smtpResponse: "Verification unavailable — pattern-based estimate",
        error: null,
        pattern: candidates[i].pattern,
      });
    }
  }

  // Sort: verified first, then inconclusive (by pattern order = likelihood), then false
  return results.sort((a, b) => {
    if (a.exists === true) return -1;
    if (b.exists === true) return 1;
    if (a.exists === null && b.exists === false) return -1;
    return 0;
  });
}
