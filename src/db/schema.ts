import {
  pgTable,
  text,
  timestamp,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { jsonb } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  publicKey: text("public_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsSessions = pgTable(
  "analytics_sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    visitorHash: text("visitor_hash").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    entryPath: text("entry_path").notNull(),
    referrer: text("referrer").notNull().default(""),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
    }).onDelete("cascade"),
    index("analytics_sessions_project_visitor_last_seen_idx").on(
      table.projectId,
      table.visitorHash,
      table.lastSeenAt,
    ),
  ],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    sessionId: text("session_id").notNull(),
    type: text("type").notNull(),
    name: text("name").notNull().default(""),
    path: text("path").notNull(),
    host: text("host").notNull(),
    referrer: text("referrer").notNull().default(""),
    props: jsonb("props"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [projects.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sessionId],
      foreignColumns: [analyticsSessions.id],
    }).onDelete("cascade"),
    index("analytics_events_project_created_at_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);
