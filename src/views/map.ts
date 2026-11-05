import { type Html, html, raw } from "../html.ts";
import type { Post } from "../posts.ts";
import { daylightPath } from "../sun.ts";
import { localTime, offsetMs } from "../time.ts";
import { PLACES } from "../zones.ts";
import { along, appearAt, drawLine } from "./intro.ts";
import { place } from "./labels.ts";

type Scheduled = { name: string; post: Post & { dueAt: Date } };

// One dot per time zone, with everyone posting from it.
type Spot = { zone: string; x: number; y: number; people: Scheduled[] };

const MONO = "JetBrains Mono, ui-monospace, Menlo, monospace";

// The bubble from the logo, about 8 map units tall, its tail just above the dot.
const BUBBLE = raw(
  '<path id="bubble" d="M116.5 4C52.3 4 0 45.3 0 96c0 28.6 16.7 55.2 45.9 72.9 4.5 2.7 7.6 7.3 8.6 12.5 2.9 16-1 32.9-6.8 47.6 19.2-9.1 39.1-23.2 54.8-36.6 3.9-3.3 9.1-4.7 14.1-4.4C180.8 188 233 146.7 233 96 233 45.3 180.8 4 116.5 4z"/>',
);

// A zone that isn't in the tz database's list (a link like "Asia/Calcutta", or "UTC") goes on the equator
// at the longitude of its UTC offset.
function position(zone: string, at: Date): [number, number] {
  return PLACES[zone] ?? [180 + offsetMs(at.getTime(), zone) / 240_000, 84];
}

function spots(entries: Scheduled[]): Spot[] {
  const byZone = new Map<string, Spot>();
  for (const entry of entries) {
    const zone = entry.post.channelTz;
    const spot = byZone.get(zone);
    if (spot) spot.people.push(entry);
    else {
      const [x, y] = position(zone, entry.post.dueAt);
      byZone.set(zone, { zone, x, y, people: [entry] });
    }
  }
  return [...byZone.values()];
}

const posted = (spot: Spot) =>
  spot.people.some(({ post }) => post.status === "sent");

function who(spot: Spot): string {
  const n = spot.people.length;
  return n > 1 ? `${place(spot.zone)} (${n} people)` : place(spot.zone);
}

export function until(at: Date, now: Date): string {
  const minutes = Math.max(
    1,
    Math.round((at.getTime() - now.getTime()) / 60_000),
  );
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function dot(spot: Spot, next: boolean): Html {
  const { x, y } = spot;
  const many = spot.people.length > 1;
  const r = many ? 3.6 : 2.4;
  const count =
    many &&
    html`<text x="${x}" y="${(y + 1.2).toFixed(1)}" text-anchor="middle" font-family="${MONO}" font-size="3.4" font-weight="700" fill="${posted(spot) ? "#0E1220" : "#F2F4F8"}">${spot.people.length}</text>`;
  if (posted(spot)) {
    return html`<g class="map-posted"><circle cx="${x}" cy="${y}" r="${r + 2.6}" fill="rgba(252,211,77,0.2)"/><circle cx="${x}" cy="${y}" r="${r}" fill="#FCD34D"/><use href="#bubble" fill="#FCD34D" transform="translate(${(x - 0.9).toFixed(1)} ${(y - 11.6).toFixed(1)}) scale(0.036)"/>${count}</g>`;
  }
  return html`<g>${next && html`<circle class="map-pulse" cx="${x}" cy="${y}" r="${r + 1.6}" fill="none" stroke="#FB923C" stroke-width="0.6"/>`}<circle cx="${x}" cy="${y}" r="${r}" fill="#131829" stroke="${next ? "#FB923C" : "#F2F4F8"}" stroke-width="0.7"/>${count}</g>`;
}

function label(spot: Spot, text: string, color = "#C8CEDA"): Html {
  // Below the dot, or above it near the bottom edge.
  const y = spot.y > 120 ? spot.y - 7 : spot.y + 7.5;
  return html`<text class="map-label" x="${spot.x}" y="${y.toFixed(1)}" text-anchor="middle" font-family="${MONO}" font-size="3" fill="${color}">${text}</text>`;
}

function frame(aria: string, inside: Html, intro = false): Html {
  return html`<figure class="world-map">
  <div class="map-frame">
    <img src="/world.svg" alt="">
    <svg viewBox="0 0 360 144" role="img" aria-label="${aria}"${intro && " data-intro"}><defs>${BUBBLE}<filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.4"/></filter></defs>${inside}</svg>
  </div>
  <figcaption class="hint">Places show each person's time zone, not where they live. A number on a dot means several people share that time zone.</figcaption>
</figure>`;
}

// The live wall: today's daylight, who posted, and whose morning comes next.
export function liveMap(entries: Scheduled[], now = new Date()): Html {
  const all = spots(entries);
  const upcoming = entries.find(
    ({ post }) => post.status !== "sent" && post.dueAt > now,
  );
  const next = all.find((spot) => spot.zone === upcoming?.post.channelTz);
  const done = all.filter(posted);
  const aria = [
    `World map at ${localTime(now, "UTC")} UTC, with the part of the world where it's day.`,
    done.length > 0 && `Posted from ${done.map(who).join(", ")}.`,
    next &&
      upcoming &&
      `Next: ${who(next)}, in ${until(upcoming.post.dueAt, now)}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return frame(
    aria,
    html`<path filter="url(#soft)" fill="rgba(251,146,60,0.16)" d="${daylightPath(now)}"/>
${all.map((spot) => dot(spot, spot === next))}
${next && upcoming && label(next, `${place(next.zone)} · next, ${until(upcoming.post.dueAt, now)}`, "#FDBA74")}`,
  );
}

// The finished wall: a line through the places in the order their posts went out.
export function finishedMap(entries: Scheduled[]): Html {
  const sent = entries.filter(({ post }) => post.status === "sent");
  const route = spots(sent);
  const first = route[0];
  const last = route.at(-1);
  // The line draws itself in the order the posts went out, and each place lights up as it gets there.
  const reached = along(route.map(({ x, y }): [number, number] => [x, y]));
  const line =
    route.length > 1 &&
    html`<path class="map-route" fill="none" stroke="rgba(251,146,60,0.75)" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" d="M${route.map(({ x, y }) => `${x} ${y}`).join("L")}">${drawLine()}</path>`;
  const time = (spot: Spot) =>
    `${localTime(spot.people[0].post.dueAt, "UTC")} UTC`;
  return frame(
    route.length > 1
      ? `World map. A line traces the posts in the order they went out: ${route.map(who).join(", ")}.`
      : `World map with the posts from ${route.map(who).join(", ") || "nowhere yet"}.`,
    html`${line}
${route.map((spot, i) => html`<g>${appearAt(reached[i])}${dot(spot, false)}</g>`)}
${first && label(first, `${place(first.zone)} · first, ${time(first)}`)}
${last && last !== first && html`<g>${appearAt(1)}${label(last, `${place(last.zone)} · last, ${time(last)}`)}</g>`}`,
    true,
  );
}
