// The free checks on a post: plain rules, no AI. The editor runs them as you type, and the server runs
// them again before anything is saved or scheduled.
import type { Chorus } from "./choruses.ts";

// From Buffer's "Character Limits" guide (developers.buffer.com).
const LIMITS: Record<string, number> = {
  bluesky: 300,
  facebook: 5000,
  googlebusiness: 4000,
  instagram: 2196,
  linkedin: 3000,
  mastodon: 500,
  pinterest: 500,
  threads: 500,
  tiktok: 4000,
  twitter: 280,
  youtube: 5000,
};

export function limitOf(service: string): number {
  return LIMITS[service] ?? 3000;
}

// Full links, and bare domains with a common ending ("northwind.example" is not one, "tally.app" is).
const LINK =
  /\bhttps?:\/\/[^\s]+|\b(?:[\w-]+\.)+(?:com|io|app|dev|org|net|co|ai|eu|uk|de|hu|me|so|xyz)(?![\w-])(?:\/[^\s]*)?/gi;

function links(text: string): string[] {
  return (text.match(LINK) ?? []).map((link) =>
    link.replace(/[.,;:!?)]+$/, ""),
  );
}

function graphemes(text: string): string[] {
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  return [...segmenter.segment(text)].map((part) => part.segment);
}

// X's weighting: Latin and common punctuation count 1, most other scripts 2, and an emoji 2 however
// many code points it has.
function xWeight(grapheme: string): number {
  if (/\p{Extended_Pictographic}/u.test(grapheme)) return 2;
  let weight = 0;
  for (const char of grapheme) {
    const code = char.codePointAt(0) ?? 0;
    const light =
      code <= 4351 ||
      (code >= 8192 && code <= 8205) ||
      (code >= 8208 && code <= 8223) ||
      (code >= 8242 && code <= 8247);
    weight += light ? 1 : 2;
  }
  return weight;
}

// Length the way Buffer checks it before posting. Mostly UTF-16 code units (an emoji is 2, a family
// emoji 8), and each network has its own rules for links on top.
export function lengthFor(service: string, text: string): number {
  const found = links(text);
  let rest = text;
  for (const link of found) rest = rest.replace(link, "");
  switch (service) {
    case "linkedin":
      return rest.length + found.length * 24;
    case "instagram":
      return text.length + (text.match(/\n/g) ?? []).length;
    case "mastodon":
      // A mention counts without its server: @ana@mastodon.social is @ana.
      return rest.replace(/(@\w+)@[\w.-]+/g, "$1").length + found.length * 23;
    case "twitter":
      return (
        graphemes(rest).reduce((sum, g) => sum + xWeight(g), 0) +
        found.length * 23
      );
    case "bluesky":
      // Bluesky shows links short: the host, and at most 16 characters of the rest.
      return (
        graphemes(rest).length +
        found.reduce((sum, link) => {
          const [, host, path] =
            /^(?:https?:\/\/)?([^/]+)(.*)$/.exec(link) ?? [];
          return sum + (host?.length ?? 0) + Math.min(path?.length ?? 0, 16);
        }, 0)
      );
    default:
      return text.length;
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
}

const HASHTAG = /#[\p{L}\p{N}_]+/gu;

export function hashtagsIn(text: string): string[] {
  return text.match(HASHTAG) ?? [];
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  timeZone: "UTC",
});
const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  timeZone: "UTC",
});

// Numbers, links, @mentions and names in a post that the fact card doesn't have. The first word of a
// sentence and "I" are skipped, so only names in the middle of a sentence count.
export function unknownClaims(text: string, chorus: Chorus): string[] {
  const day = new Date(`${chorus.day}T00:00:00Z`);
  const source = normalize(
    [
      chorus.title,
      ...chorus.facts,
      chorus.link ?? "",
      ...chorus.hashtags,
      chorus.day,
      chorus.localTime,
      WEEKDAY.format(day),
      MONTH.format(day),
    ].join(" "),
  );
  const digits = source.replace(/[,\s]/g, "");
  const found = links(text);
  let rest = text;
  for (const link of found) rest = rest.replace(link, " ");
  rest = rest.replace(HASHTAG, " ");

  const claims: string[] = [];
  for (const link of found) {
    const host = link
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .replace(/^www\./, "");
    if (!source.includes(host.toLowerCase())) claims.push(link);
  }
  for (const mention of rest.match(/@[\w.]+\w/g) ?? []) {
    if (!source.includes(mention.toLowerCase())) claims.push(mention);
  }
  rest = rest.replace(/@[\w.]+\w/g, " ");
  for (const number of rest.match(/[$€£]?\d[\d.,:]*%?/g) ?? []) {
    const bare = number.replace(/[$€£%]|[.,:]+$/g, "");
    if (!digits.includes(bare.replace(/,/g, "")))
      claims.push(number.replace(/[.,:]+$/, ""));
  }
  for (const sentence of rest.split(/(?<=[.!?:])\s+|\n+/)) {
    const words = sentence.trim().split(/\s+/).slice(1);
    for (const word of words) {
      const name = word
        .replace(/^[^\p{L}]+|[^\p{L}\p{N}]+$/gu, "")
        .replace(/['’]s$/, "");
      if (!/^\p{Lu}/u.test(name) || name === "I" || /^I['’]/.test(name))
        continue;
      if (!source.includes(name.toLowerCase())) claims.push(name);
    }
  }
  return [...new Set(claims)];
}

export type Check = {
  level: "ok" | "warn" | "block"; // only "block" stops a post: Buffer would refuse it
  text: string;
};

export type CheckResult = { length: number; limit: number; checks: Check[] };

export function checkPost(
  text: string,
  chorus: Chorus,
  service: string,
  organizer: string,
): CheckResult {
  const length = lengthFor(service, text);
  const limit = limitOf(service);
  const checks: Check[] = [];
  const tags = hashtagsIn(text);
  const main = chorus.hashtags[0];

  if (!text.trim()) {
    checks.push({ level: "block", text: "Write your post first." });
  } else if (length > limit) {
    checks.push({
      level: "block",
      text: `Too long by ${(length - limit).toLocaleString("en")} characters for this network.`,
    });
  }

  if (main && !tags.some((tag) => tag.toLowerCase() === main.toLowerCase())) {
    checks.push({
      level: "warn",
      text: `Add ${main}, so all the posts can be found together.`,
    });
  } else if (main) {
    checks.push({ level: "ok", text: `Has ${main}.` });
  }
  if (service === "threads" && tags.length > 1) {
    checks.push({
      level: "warn",
      text: "Threads shows only one hashtag. Keep just the first.",
    });
  } else if (chorus.maxHashtags && tags.length > chorus.maxHashtags) {
    checks.push({
      level: "warn",
      text: `${tags.length} hashtags: ${organizer} asked for at most ${chorus.maxHashtags}.`,
    });
  }

  const avoided = chorus.avoid.filter((item) =>
    normalize(text).includes(normalize(item)),
  );
  for (const item of avoided) {
    checks.push({
      level: "warn",
      text: `On the "Please avoid" list: "${item}".`,
    });
  }

  const claims = unknownClaims(text, chorus);
  if (claims.length) {
    checks.push({
      level: "warn",
      text: `Not on the fact card: ${claims.join(", ")}. Check them, or ask ${organizer} to add them.`,
    });
  } else if (text.trim()) {
    checks.push({
      level: "ok",
      text: "Every number, name and link is on the fact card.",
    });
  }
  return { length, limit, checks };
}
