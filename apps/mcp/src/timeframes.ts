const DAY_MS = 24 * 60 * 60 * 1000;

export const timeframePresetValues = [
  "last_7_days",
  "last_14_days",
  "last_30_days",
  "last_60_days",
  "last_90_days",
  "this_month",
  "all_time",
] as const;

export type TimeframePreset = (typeof timeframePresetValues)[number];

export type TimeframeInput = {
  preset?: TimeframePreset;
  since?: string;
  until?: string;
};

export type ResolvedTimeframe = {
  label: string;
  start: Date | null;
  end: Date | null;
};

function atUtcStartOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function atUtcEndOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function shiftUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function parseDateInput(value: string | undefined, label: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label} date: ${value}`);
  }

  return parsed;
}

export function resolveTimeframe(input?: TimeframeInput): ResolvedTimeframe {
  const now = new Date();

  if (input?.since || input?.until) {
    const since = parseDateInput(input.since, "since");
    const until = parseDateInput(input.until, "until");

    if (since && until && since.getTime() > until.getTime()) {
      throw new Error("The since date must be earlier than or equal to the until date.");
    }

    return {
      label: input.preset ?? "custom",
      start: since ? atUtcStartOfDay(since) : null,
      end: until ? atUtcEndOfDay(until) : atUtcEndOfDay(now),
    };
  }

  const preset = input?.preset ?? "last_30_days";
  const end = atUtcEndOfDay(now);

  if (preset === "all_time") {
    return {
      label: preset,
      start: null,
      end,
    };
  }

  if (preset === "this_month") {
    return {
      label: preset,
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)),
      end,
    };
  }

  const daysByPreset: Record<Exclude<TimeframePreset, "this_month" | "all_time">, number> = {
    last_7_days: 7,
    last_14_days: 14,
    last_30_days: 30,
    last_60_days: 60,
    last_90_days: 90,
  };

  return {
    label: preset,
    start: atUtcStartOfDay(shiftUtcDays(now, -(daysByPreset[preset] - 1))),
    end,
  };
}

export function formatTimeframe(window: ResolvedTimeframe) {
  return {
    label: window.label,
    start: window.start?.toISOString() ?? null,
    end: window.end?.toISOString() ?? null,
  };
}
