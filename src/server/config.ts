/**
 * Boot-time configuration guard.
 *
 * In production (NODE_ENV=production) both SPOOR_HASH_SECRET and
 * BETTER_AUTH_SECRET must be set to a non-empty, non-whitespace value.
 * An empty string injected by docker-compose (when the host env var is unset)
 * is treated the same as absent — the app refuses to start rather than silently
 * running with a publicly-known or empty secret.
 *
 * In development the dev fallbacks are used when the vars are absent.
 */

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

const isProd = process.env["NODE_ENV"] === "production";

if (isProd) {
  const missing: string[] = [];
  if (isBlank(process.env["SPOOR_HASH_SECRET"])) missing.push("SPOOR_HASH_SECRET");
  if (isBlank(process.env["BETTER_AUTH_SECRET"])) missing.push("BETTER_AUTH_SECRET");
  if (missing.length > 0) {
    // Use process.stderr.write so the message appears even if the logger isn't up yet.
    process.stderr.write(
      `[spoor] FATAL: required secret(s) missing or empty in production: ${missing.join(", ")}\n` +
      `[spoor] Set these environment variables before starting the app.\n`,
    );
    process.exit(1);
  }
}

export const SPOOR_HASH_SECRET: string =
  process.env["SPOOR_HASH_SECRET"] ??
  (isProd ? "" : "dev-hash-secret-change-me");

export const BETTER_AUTH_SECRET: string =
  process.env["BETTER_AUTH_SECRET"] ??
  (isProd ? "" : "dev-secret-change-me");
