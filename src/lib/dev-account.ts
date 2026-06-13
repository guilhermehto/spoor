/**
 * Shared dev-account credentials.
 *
 * Seeded into the database on `pnpm dev` (see src/db/seed.ts) and pre-filled on
 * the login form in development. Never used in production: the seed refuses to
 * run when NODE_ENV=production, and the login autofill is gated on
 * import.meta.env.DEV.
 *
 * This module intentionally has no server-only imports, so it is safe to import
 * from client components (the login page) as well as the seed script.
 */
export const DEV_ACCOUNT = {
  name: "Dev Admin",
  email: "dev@spoor.local",
  // Must be >= 8 chars to satisfy better-auth's password policy.
  password: "spoordev123",
} as const;
