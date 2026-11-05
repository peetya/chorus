import { type Html, html } from "../html.ts";

// Chorus pages are shareable, so other people show as first name and initial: "Péter H.".
export function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.at(-1)?.[0] : "";
  return ((parts[0][0] ?? "?") + last).toUpperCase();
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

// The way back up, like "My Choruses / Northwind ships Tally 2.0".
export function crumbs(...links: [href: string, label: string][]): Html {
  return html`<nav class="crumbs" aria-label="Breadcrumbs">${links.map(
    ([href, label], i) =>
      html`${i > 0 && html`<span aria-hidden="true">/</span>`}<a href="${href}" class="back">${label}</a>`,
  )}</nav>`;
}
