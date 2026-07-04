ALTER TABLE "analytics_events" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
-- Backfill: extract utm params from historical raw paths, then strip query/hash.
-- ponytail: no URL-decoding in backfill SQL; encoded values keep their %XX — acceptable for historical rows
UPDATE analytics_events SET utm_source = nullif(substring(path from 'utm_source=([^&#]*)'), '') WHERE path ~ 'utm_source=';--> statement-breakpoint
UPDATE analytics_events SET utm_medium = nullif(substring(path from 'utm_medium=([^&#]*)'), '') WHERE path ~ 'utm_medium=';--> statement-breakpoint
UPDATE analytics_events SET utm_campaign = nullif(substring(path from 'utm_campaign=([^&#]*)'), '') WHERE path ~ 'utm_campaign=';--> statement-breakpoint
UPDATE analytics_events SET path = split_part(split_part(path, '?', 1), '#', 1) WHERE path ~ '[?#]';--> statement-breakpoint
UPDATE analytics_sessions SET entry_path = split_part(split_part(entry_path, '?', 1), '#', 1) WHERE entry_path ~ '[?#]';