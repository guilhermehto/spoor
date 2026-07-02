/**
 * Cookieless visitor identity.
 *
 * Daily salt: HMAC-SHA-256(SPOOR_HASH_SECRET, utcDate) where utcDate is
 * "YYYY-MM-DD" in UTC.  The salt rotates at UTC midnight, so the same
 * physical visitor gets a different hash on different calendar days.
 *
 * Visitor hash: SHA-256(salt + projectId + clientIp + userAgent) encoded as hex.
 *
 * No cookies, no localStorage, no persistent cross-site identity.
 */

import { SPOOR_HASH_SECRET } from "./config";

/** Returns the UTC calendar date string "YYYY-MM-DD" for a given timestamp. */
export function utcDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Derives the daily salt via HMAC-SHA-256(secret, utcDate). */
async function dailySalt(utcDate: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SPOOR_HASH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, enc.encode(utcDate));
}

/**
 * Computes the privacy-preserving visitor hash for a given request context.
 *
 * @param projectId  The project's database id (not the public key).
 * @param clientIp   The client IP extracted from X-Forwarded-For or socket.
 * @param userAgent  The User-Agent header value.
 * @param now        The event timestamp (used to derive the UTC date).
 */
export async function computeVisitorHash(
  projectId: string,
  clientIp: string,
  userAgent: string,
  now: Date,
): Promise<string> {
  const salt = await dailySalt(utcDateString(now));
  const enc = new TextEncoder();
  // Concatenate salt bytes + projectId + clientIp + userAgent
  const saltBytes = new Uint8Array(salt);
  const rest = enc.encode(`${projectId}:${clientIp}:${userAgent}`);
  const combined = new Uint8Array(saltBytes.byteLength + rest.byteLength);
  combined.set(saltBytes, 0);
  combined.set(rest, saltBytes.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", combined);
  return Buffer.from(digest).toString("hex");
}

/**
 * Extracts the client IP from request headers.
 *
 * Reverse proxies (Traefik, nginx) APPEND the connecting peer's address to
 * X-Forwarded-For, so the left-most entries are whatever the client sent —
 * attacker-controlled. We take the RIGHT-most non-empty entry: the hop our
 * own proxy appended. Falls back to the socket address when absent.
 *
 * Residual limitation: with no proxy at all, a directly-sent header is still
 * client-controlled; no-proxy deployments only get the socket address when
 * the header is absent.
 */
export function extractClientIp(
  xForwardedFor: string | null | undefined,
  socketAddress: string,
): string {
  if (xForwardedFor) {
    const parts = xForwardedFor.split(",");
    for (let i = parts.length - 1; i >= 0; i--) {
      const entry = parts[i]?.trim();
      if (entry) return entry;
    }
  }
  return socketAddress;
}
