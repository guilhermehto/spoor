import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env["DATABASE_URL"] ?? "postgres://spoor:spoor@localhost:5433/spoor";

const client = postgres(connectionString);

export const db = drizzle(client, { schema });
