import { randomBytes } from "node:crypto";
import { collection } from "./db.ts";
import { RELAY_END, relayTimes, zonedToUtc } from "./time.ts";
import { PLACES } from "./zones.ts";

export const TONES = {
  any: "Let everyone choose",
  casual: "Casual",
  professional: "Professional",
  excited: "Excited",
  thoughtful: "Thoughtful",
} as const;

export type Tone = keyof typeof TONES;

// Minutes between two posts in a relay.
export const RELAY_GAPS = [20, 30, 45, 60];

// What the organizer fills in.
export type ChorusInput = {
  title: string;
  note?: string;
  facts: string[]; // the fact card: every post is checked against it
  link?: string;
  hashtags: string[]; // the first one goes in every post, the rest are suggestions
  maxHashtags?: number; // empty = no limit
  avoid: string[];
  questions: string[]; // a guide next to the editor, and the AI form's fields
  tone: Tone;
  day: string; // "2026-11-11"
  // A wave goes out at the same local time in every time zone. A relay goes out one post after another
  // in one time zone, from localTime on, one every relayGapMin minutes.
  kind: "wave" | "relay";
  localTime: string; // "09:00": a wave's time everywhere, or a relay's first post
  relayTz?: string;
  relayGapMin?: number;
};

export type Chorus = ChorusInput & {
  _id: string; // short, also the invite code
  ownerId: string;
  createdAt: Date;
};

export type Relay = Chorus & {
  kind: "relay";
  relayTz: string;
  relayGapMin: number;
};

export function isRelay(chorus: Chorus): chorus is Relay {
  return chorus.kind === "relay";
}

// The time zone a post goes out in: the relay's, or the person's own in a wave.
export function zoneOf(chorus: Chorus, post: { channelTz: string }): string {
  return isRelay(chorus) ? chorus.relayTz : post.channelTz;
}

// When each slot of a relay goes out, in order.
export function relaySlots(chorus: Relay): Date[] {
  return relayTimes(chorus.localTime, chorus.relayGapMin).map((time) =>
    zonedToUtc(chorus.day, time, chorus.relayTz),
  );
}

// The day as it is in this time zone, like "2026-11-11".
function dayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export const LIMITS = { facts: 12, hashtags: 10, avoid: 12, questions: 3 };
const LINE = 200;

export function choruses() {
  return collection<Chorus>("choruses", [{ key: { ownerId: 1, day: 1 } }]);
}

// A repeated form field arrives as an array, a single one as a string.
function list(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isDay(day: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    new Date(`${day}T00:00:00Z`).toISOString().startsWith(day)
  );
}

export function addDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

// "2026-11-11" plus 3 -> "2026-11-14".
export function plusDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

// A wave runs through every time zone, so joining stays open until the day after. A relay is over when
// its day is over in its time zone.
export function isOver(chorus: Chorus): boolean {
  if (isRelay(chorus)) return chorus.day < dayIn(chorus.relayTz);
  return chorus.day < addDays(-1);
}

// Live from midnight where the day starts first (UTC+14), or in the relay's zone, until joining closes.
export function isLive(chorus: Chorus): boolean {
  const zone = isRelay(chorus) ? chorus.relayTz : "Pacific/Kiritimati";
  const start = zonedToUtc(chorus.day, "00:00", zone);
  return Date.now() >= start.getTime() && !isOver(chorus);
}

function isLink(link: string): boolean {
  try {
    return ["https:", "http:"].includes(new URL(link).protocol);
  } catch {
    return false;
  }
}

// Reads the form and says what's wrong with it. The input comes back either way, so the form can show
// what the person typed.
export function parseChorus(body: Record<string, unknown>): {
  input: ChorusInput;
  errors: string[];
} {
  const hashtags = text(body.hashtags)
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#+/, ""))
    .filter(Boolean);
  const maxHashtags = Number(body.maxHashtags);
  const tone = text(body.tone);
  const kind = body.kind === "relay" ? "relay" : "wave";
  const input: ChorusInput = {
    title: text(body.title),
    note: text(body.note) || undefined,
    facts: list(body.facts),
    link: text(body.link) || undefined,
    hashtags: hashtags.map((tag) => `#${tag}`),
    maxHashtags: [1, 2, 3].includes(maxHashtags) ? maxHashtags : undefined,
    avoid: list(body.avoid),
    questions: list(body.questions),
    tone: tone in TONES ? (tone as Tone) : "any",
    day: text(body.day),
    kind,
    localTime: text(body.localTime) || "09:00",
    relayTz: kind === "relay" ? text(body.relayTz) : undefined,
    relayGapMin: kind === "relay" ? Number(body.relayGapMin) : undefined,
  };

  const errors: string[] = [];
  const tooLong = (items: string[]) => items.some((item) => item.length > LINE);
  if (!input.title) errors.push("Say what's happening: the title is empty.");
  if (input.title.length > 120)
    errors.push("Keep the title under 120 characters.");
  if ((input.note?.length ?? 0) > 1000)
    errors.push("Keep the note under 1,000 characters.");
  if (!input.facts.length) errors.push("Add at least one fact.");
  if (input.facts.length > LIMITS.facts)
    errors.push(`Add at most ${LIMITS.facts} facts.`);
  if (input.link && !isLink(input.link))
    errors.push("The link must start with https://");
  if (!hashtags.length)
    errors.push("Add a hashtag. The first one goes in every post.");
  if (hashtags.length > LIMITS.hashtags)
    errors.push(`Add at most ${LIMITS.hashtags} hashtags.`);
  if (hashtags.some((tag) => !/^[\p{L}\p{N}_]{1,50}$/u.test(tag))) {
    errors.push("Hashtags can have letters, numbers and _ only.");
  }
  if (input.avoid.length > LIMITS.avoid)
    errors.push(`Add at most ${LIMITS.avoid} things to avoid.`);
  if (!input.questions.length) errors.push("Add at least one question.");
  if (input.questions.length > LIMITS.questions) {
    errors.push(`Add at most ${LIMITS.questions} questions.`);
  }
  if ([input.facts, input.avoid, input.questions].some(tooLong)) {
    errors.push(`Keep each line under ${LINE} characters.`);
  }
  // Yesterday is still allowed: in time zones behind UTC it can be today.
  if (
    !isDay(input.day) ||
    input.day < addDays(-1) ||
    input.day > addDays(366)
  ) {
    errors.push("Pick a day between today and a year from now.");
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.localTime)) {
    errors.push("Pick a time, like 09:00.");
  }
  if (kind === "relay") {
    // Only zones with a city we know, so the wall can show that city's sun.
    if (!Object.hasOwn(PLACES, input.relayTz ?? "")) {
      errors.push("Pick the time zone of the relay.");
    }
    if (!RELAY_GAPS.includes(input.relayGapMin ?? 0)) {
      errors.push("Pick how often a new post goes out.");
    }
    if (input.localTime >= RELAY_END) {
      errors.push(`A relay's first post must be before ${RELAY_END}.`);
    }
  }
  return { input, errors };
}

export async function createChorus(
  ownerId: string,
  input: ChorusInput,
): Promise<Chorus> {
  const chorus: Chorus = {
    ...input,
    _id: randomBytes(6).toString("base64url"),
    ownerId,
    createdAt: new Date(),
  };
  await (await choruses()).insertOne(chorus);
  return chorus;
}

// Buffer allows 500 API calls a day for the whole app, so each person runs one Chorus at a time, and
// CHORUS_CREATE=off pauses new ones while a big wave needs the budget.
export function canCreate(): boolean {
  return process.env.CHORUS_CREATE !== "off";
}

// Not over yet: see isOver. Two Choruses started in the same second can both get through; rare enough.
export async function openChorusOf(ownerId: string): Promise<Chorus | null> {
  return (await choruses()).findOne({ ownerId, day: { $gte: addDays(-1) } });
}

export async function listOwned(ownerId: string): Promise<Chorus[]> {
  return (await choruses()).find({ ownerId }).sort({ day: 1 }).toArray();
}

export async function getChorus(id: string): Promise<Chorus | null> {
  return (await choruses()).findOne({ _id: id });
}

export async function chorusesById(ids: string[]): Promise<Chorus[]> {
  return (await choruses()).find({ _id: { $in: ids } }).toArray();
}
