import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const connectionString =
  process.env["DATABASE_URL"] ?? "postgres://spoor:spoor@db:5432/spoor";

// Wait for Postgres to accept connections before migrating.
const MAX_ATTEMPTS = 30;
const RETRY_DELAY_MS = 2000;

async function waitForDb(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const probe = postgres(connectionString, {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
    });
    try {
      await probe`SELECT 1`;
      await probe.end();
      console.log("Database is ready.");
      return;
    } catch (err) {
      await probe.end({ timeout: 1 }).catch(() => {});
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `Database not ready (attempt ${attempt}/${MAX_ATTEMPTS}): ${msg}`,
      );
      if (attempt === MAX_ATTEMPTS) {
        throw new Error("Database did not become ready in time.");
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

await waitForDb();

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

// Works both from source (tsx) and from the compiled bundle (esbuild --bundle)
const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../drizzle",
);

await migrate(db, { migrationsFolder });
console.log("Migrations applied successfully.");
await client.end();
