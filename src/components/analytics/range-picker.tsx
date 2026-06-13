/**
 * DateRangePicker — preset buttons (Today, 7d, 30d) plus a custom date range
 * input.  Reads/writes `from` and `to` URL search params (ISO date strings).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { useNavigate } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

type Preset = "today" | "7d" | "30d" | "custom";

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function utcDayEnd(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function toDateInput(iso: string): string {
  // "2024-06-01T00:00:00.000Z" → "2024-06-01"
  return iso.slice(0, 10);
}

export function buildRange(preset: Preset, customFrom?: string, customTo?: string, now: Date = new Date()): { from: string; to: string } {
  if (preset === "today") {
    return {
      from: utcDayStart(now).toISOString(),
      to: utcDayEnd(now).toISOString(),
    };
  }
  if (preset === "7d") {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 6);
    return {
      from: utcDayStart(from).toISOString(),
      to: utcDayEnd(now).toISOString(),
    };
  }
  if (preset === "30d") {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 29);
    return {
      from: utcDayStart(from).toISOString(),
      to: utcDayEnd(now).toISOString(),
    };
  }
  // custom
  const from = customFrom ? new Date(customFrom) : new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const to = customTo ? new Date(customTo) : now;
  return {
    from: utcDayStart(from).toISOString(),
    to: utcDayEnd(to).toISOString(),
  };
}

export function detectPreset(from: string, to: string, now: Date = new Date()): Preset {
  const todayStart = utcDayStart(now).toISOString();
  const todayEnd = utcDayEnd(now).toISOString();

  if (from === todayStart && to === todayEnd) return "today";

  const sevenFrom = new Date(now);
  sevenFrom.setUTCDate(sevenFrom.getUTCDate() - 6);
  if (from === utcDayStart(sevenFrom).toISOString() && to === todayEnd) return "7d";

  const thirtyFrom = new Date(now);
  thirtyFrom.setUTCDate(thirtyFrom.getUTCDate() - 29);
  if (from === utcDayStart(thirtyFrom).toISOString() && to === todayEnd) return "30d";

  return "custom";
}

interface RangePickerProps {
  from: string;
  to: string;
}

export function RangePicker({ from, to }: RangePickerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigate = useNavigate() as any;

  const activePreset = detectPreset(from, to);

  function applyPreset(preset: Preset) {
    const range = buildRange(preset);
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, from: range.from, to: range.to }),
      replace: true,
    });
  }

  function applyCustom(field: "from" | "to", value: string) {
    if (!value) return;
    const currentFrom = field === "from" ? value : toDateInput(from);
    const currentTo = field === "to" ? value : toDateInput(to);
    const range = buildRange("custom", currentFrom, currentTo);
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, from: range.from, to: range.to }),
      replace: true,
    });
  }

  const presets: { label: string; value: Preset }[] = [
    { label: "Today", value: "today" },
    { label: "Last 7 days", value: "7d" },
    { label: "Last 30 days", value: "30d" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <Button
          key={p.value}
          variant={activePreset === p.value ? "default" : "outline"}
          size="sm"
          onClick={() => applyPreset(p.value)}
        >
          {p.label}
        </Button>
      ))}
      <div className="flex items-center gap-1">
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={toDateInput(from)}
          onChange={(e) => applyCustom("from", e.target.value)}
        />
        <span className="text-muted-foreground text-xs">–</span>
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={toDateInput(to)}
          onChange={(e) => applyCustom("to", e.target.value)}
        />
      </div>
    </div>
  );
}
