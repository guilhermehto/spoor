import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { resolve } from "path";
import { fileURLToPath } from "url";

const connectionString =
  process.env["DATABASE_URL"] ?? "postgres://spoor:spoor@localhost:5433/spoor";

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

const migrationsFolder = resolve(
  fileURLToPath(import.meta.url),
  "../../../drizzle",
);

await migrate(db, { migrationsFolder });
console.log("Migrations applied successfully.");
await client.end();
