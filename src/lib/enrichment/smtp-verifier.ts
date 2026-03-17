/**
 * Verify if an email address exists using DNS MX lookup + SMTP handshake.
 *
 * How it works:
 * 1. Check if the domain has MX records (can receive email)
 * 2. Connect to the mail server
 * 3. Simulate sending an email (RCPT TO) without actually sending
 * 4. The server responds with 250 (exists) or 550 (doesn't exist)
 *
 * Note: Many servers block this or return 250 for all addresses (catch-all).
 * We detect catch-all domains and flag them.
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
 * Returns the highest-priority mail server.
 */
async function getMxHost(domain: string): Promise<string | null> {
  try {
    const records = await dns.resolveMx(domain);
    if (!records.length) return null;
    // Sort by priority (lowest number = highest priority)
    records.sort((a, b) => a.priority - b.priority);
    return records[0].exchange;
  } catch {
    return null;
  }
}

/**
 * Send an SMTP command and wait for a response.
 */
function smtpCommand(
  socket: Socket,
  command: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("SMTP timeout"));
    }, 10000);

    socket.once("data", (data) => {
      clearTimeout(timeout);
      resolve(data.toString());
    });

    socket.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    if (command) {
      socket.write(command + "\r\n");
    }
  });
}

/**
 * Connect to an SMTP server and verify if an email exists.
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
      } catch {
        // ignore
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve({ exists: null, response: "Connection timeout" });
    }, 15000);

    socket.connect(25, mxHost, async () => {
      try {
        // Read greeting
        lastResponse = await smtpCommand(socket, "");

        // EHLO
        lastResponse = await smtpCommand(socket, "EHLO scraped.io");

        // MAIL FROM
        lastResponse = await smtpCommand(
          socket,
          "MAIL FROM:<verify@scraped.io>"
        );

        // RCPT TO — this is where we learn if the email exists
        lastResponse = await smtpCommand(socket, `RCPT TO:<${email}>`);

        clearTimeout(timeout);
        cleanup();

        const code = parseInt(lastResponse.substring(0, 3));

        if (code === 250) {
          resolve({ exists: true, response: lastResponse.trim() });
        } else if (code === 550 || code === 551 || code === 553) {
          resolve({ exists: false, response: lastResponse.trim() });
        } else {
          resolve({ exists: null, response: lastResponse.trim() });
        }
      } catch (err: any) {
        clearTimeout(timeout);
        cleanup();
        resolve({ exists: null, response: err.message });
      }
    });

    socket.on("error", () => {
      clearTimeout(timeout);
      resolve({ exists: null, response: "Connection failed" });
    });
  });
}

/**
 * Check if a domain is a catch-all (accepts any email).
 * We test with a random fake address — if it returns 250, it's catch-all.
 */
async function isCatchAllDomain(
  domain: string,
  mxHost: string
): Promise<boolean> {
  const fakeEmail = `scraped-verify-${Date.now()}@${domain}`;
  const result = await smtpVerify(fakeEmail, mxHost);
  return result.exists === true;
}

/**
 * Verify a single email address.
 */
export async function verifyEmail(email: string): Promise<VerificationResult> {
  const domain = email.split("@")[1];
  if (!domain) {
    return {
      email,
      exists: false,
      isCatchAll: false,
      mxHost: null,
      smtpResponse: null,
      error: "Invalid email format",
    };
  }

  // Step 1: DNS MX lookup
  const mxHost = await getMxHost(domain);
  if (!mxHost) {
    return {
      email,
      exists: false,
      isCatchAll: false,
      mxHost: null,
      smtpResponse: null,
      error: "No MX records found — domain cannot receive email",
    };
  }

  // Step 2: Check if catch-all
  const catchAll = await isCatchAllDomain(domain, mxHost);

  // Step 3: SMTP verify
  const result = await smtpVerify(email, mxHost);

  return {
    email,
    exists: catchAll ? null : result.exists,
    isCatchAll: catchAll,
    mxHost,
    smtpResponse: result.response,
    error: null,
  };
}

/**
 * Verify multiple email candidates and return ranked results.
 * Stops early once a verified email is found.
 */
export async function verifyEmailBatch(
  candidates: { email: string; pattern: string }[]
): Promise<(VerificationResult & { pattern: string })[]> {
  const results: (VerificationResult & { pattern: string })[] = [];

  // Verify in batches of 3 to avoid overwhelming mail servers
  for (let i = 0; i < candidates.length; i += 3) {
    const batch = candidates.slice(i, i + 3);
    const verifications = await Promise.all(
      batch.map(async (candidate) => {
        const result = await verifyEmail(candidate.email);
        return { ...result, pattern: candidate.pattern };
      })
    );

    results.push(...verifications);

    // If we found a verified email, stop checking
    const verified = verifications.find((v) => v.exists === true);
    if (verified) break;
  }

  // Sort: verified first, then inconclusive, then false
  return results.sort((a, b) => {
    if (a.exists === true) return -1;
    if (b.exists === true) return 1;
    if (a.exists === null && b.exists === false) return -1;
    return 0;
  });
}
