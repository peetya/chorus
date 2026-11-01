import { type Chorus, isRelay } from "../choruses.ts";

// Chorus pages are shareable, so other people show as first name and initial: "Péter H.".
export function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    parts[0][0] + (parts.length > 1 ? parts.at(-1)?.[0] : "")
  ).toUpperCase();
}

const SERVICES: Record<string, string> = {
  bluesky: "Bluesky",
  facebook: "Facebook",
  googlebusiness: "Google Business",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  mastodon: "Mastodon",
  pinterest: "Pinterest",
  threads: "Threads",
  tiktok: "TikTok",
  twitter: "X",
  youtube: "YouTube",
};

export function serviceName(service: string): string {
  return SERVICES[service] ?? service;
}

// "America/New_York" -> "New York"
export function place(timezone: string): string {
  return (timezone.split("/").at(-1) ?? timezone).replaceAll("_", " ");
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

// "2026-11-11" -> "Wed 11 Nov"
export function showDay(day: string): string {
  return DAY.format(new Date(`${day}T00:00:00Z`));
}

const ORDINALS: Record<string, string> = {
  one: "st",
  two: "nd",
  few: "rd",
  other: "th",
};

// 1 -> "1st", 4 -> "4th", 22 -> "22nd"
export function ordinal(n: number): string {
  const rule = new Intl.PluralRules("en", { type: "ordinal" }).select(n);
  return `${n}${ORDINALS[rule] ?? "th"}`;
}

// "09:00 in each person's time zone", or for a relay "from 09:00 Budapest time, a new voice every 45 min".
export function timing(chorus: Chorus): string {
  if (!isRelay(chorus)) return `${chorus.localTime} in each person's time zone`;
  const gap = chorus.relayGapMin === 60 ? "hour" : `${chorus.relayGapMin} min`;
  return `from ${chorus.localTime} ${place(chorus.relayTz)} time, a new voice every ${gap}`;
}
