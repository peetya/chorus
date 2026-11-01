import { canCreate, isRelay, type Relay, relaySlots } from "../choruses.ts";
import { type Html, html } from "../html.ts";
import { placeOf, sunHeight, sunTimes } from "../sunrise.ts";
import { localTime, zonedToUtc } from "../time.ts";
import type { ChorusView, Joined } from "./chorus.ts";
import { joinBox } from "./chorus.ts";
import { along, appearAt, drawLine, travel } from "./intro.ts";
import {
  initials,
  ordinal,
  place,
  serviceName,
  shortName,
  showDay,
  timing,
} from "./labels.ts";
import { count, type Entry, realLink, scheduled, state } from "./wall.ts";

const MONO = "JetBrains Mono, ui-monospace, Menlo, monospace";
const SANS = "Instrument Sans, ui-sans-serif, system-ui, sans-serif";

// The drawing is 360 by 142: the day runs from left to right, the sun's height from the horizon up.
const LEFT = 16;
const RIGHT = 344;
const HORIZON = 122;
const TOP = 30;
const MINUTE = 60_000;

function fixed(n: number): string {
  return n.toFixed(1);
}

// "25 min", "1 h" or "2 h 5 min" from now.
function inTime(at: Date, now: number): string {
  const minutes = Math.max(1, Math.round((at.getTime() - now) / MINUTE));
  const hours = Math.floor(minutes / 60);
  return [hours > 0 && `${hours} h`, minutes % 60 > 0 && `${minutes % 60} min`]
    .filter(Boolean)
    .join(" ");
}

// The first post still to come, once the relay has a "now".
function nextUp(entries: Entry[], now: number | null): Entry | undefined {
  return now === null
    ? undefined
    : entries.find(
        ({ post }) => post.status !== "sent" && post.dueAt.getTime() > now,
      );
}

const firstName = (name: string) => shortName(name).split(" ")[0];

// The sun's path over the relay's city that day, and everyone on it at their time. now is null on the
// finished page: then the whole path is gold and there is no sun. small is the card on My Choruses: dots
// only, no faces.
function sunPath(
  chorus: Relay,
  entries: Entry[],
  now: number | null,
  small = false,
): Html {
  const zone = chorus.relayTz;
  const { lat, lon } = placeOf(zone);
  const slots = relaySlots(chorus);
  const sun = sunTimes(chorus.day, zone);
  // Half an hour around the daylight and the slots, whichever reaches further.
  const from =
    Math.min(sun?.sunrise.getTime() ?? Infinity, slots[0].getTime()) -
    30 * MINUTE;
  const to =
    Math.max(sun?.sunset.getTime() ?? 0, slots[slots.length - 1].getTime()) +
    30 * MINUTE;
  const x = (at: number) => LEFT + ((at - from) / (to - from)) * (RIGHT - LEFT);
  const height = (at: number) => sunHeight(new Date(at), lat, lon);

  const times: number[] = [];
  for (let at = from; at <= to; at += 5 * MINUTE) times.push(at);
  if (sun) times.push(sun.sunrise.getTime(), sun.sunset.getTime());
  if (now !== null && now > from && now < to) times.push(now);
  times.sort((a, b) => a - b);
  const peak = Math.max(...times.map(height));
  const scale = (HORIZON - TOP) / Math.max(peak, 1);
  const y = (at: number) => HORIZON - Math.max(height(at), 0) * scale;

  // The part of the path above the horizon, split at now: gold where the day has been, dashed ahead.
  const arc = times.filter((at) => height(at) > -1);
  const line = (part: number[]) =>
    part.length > 1
      ? `M${part.map((at) => `${fixed(x(at))} ${fixed(y(at))}`).join("L")}`
      : "";
  const finished = now === null;
  const past = now === null ? arc : arc.filter((at) => at <= now);
  // On the finished page the sun travels the path once, drawing it, and each person appears as it passes.
  const reached = along(past.map((at): [number, number] => [x(at), y(at)]));
  const passed = (at: number) => {
    const i = past.findIndex((time) => time >= at);
    return i < 0 ? 1 : reached[i];
  };
  const ahead = now === null ? [] : arc.filter((at) => at >= now);
  const glow =
    past.length > 1 &&
    `${line(past)}L${fixed(x(past[past.length - 1]))} ${HORIZON}L${fixed(x(past[0]))} ${HORIZON}Z`;

  const ticks: Html[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const at = zonedToUtc(
      chorus.day,
      `${String(hour).padStart(2, "0")}:00`,
      zone,
    ).getTime();
    if (at < from || at > to) continue;
    ticks.push(
      html`<path d="M${fixed(x(at))} ${HORIZON}v2" stroke="#39425A" stroke-width="0.5"/><text class="sun-label" x="${fixed(x(at))}" y="129.5">${localTime(new Date(at), zone)}</text>`,
    );
  }
  const edge = (at: Date, label: string) => {
    const where = Math.min(RIGHT - 14, Math.max(LEFT + 14, x(at.getTime())));
    return html`<text class="sun-label" x="${fixed(where)}" y="136.5">${label} ${localTime(at, zone)}</text>`;
  };
  const sunLabels = sun
    ? [edge(sun.sunrise, "sunrise"), edge(sun.sunset, "sunset")]
    : html`<text class="sun-label" x="180" y="136.5">${peak > 0 ? "The sun doesn't set today" : "The sun doesn't rise today"}</text>`;

  // Faces and names hang below the path. Close slots take turns between two rows so they don't overlap;
  // when even that is too tight, just the dots, and the list below the drawing has the names.
  const room = ((chorus.relayGapMin * MINUTE) / (to - from)) * (RIGHT - LEFT);
  const next = nextUp(entries, now);
  const people = entries.map((entry, i) => {
    const at = entry.post.dueAt.getTime();
    const person = onPath(entry, i);
    return finished ? html`<g>${appearAt(passed(at))}${person}</g>` : person;
  });
  function onPath(entry: Entry, i: number): Html {
    const { post, name } = entry;
    const at = post.dueAt.getTime();
    const px = x(at);
    const py = y(at);
    const posted = post.status === "sent";
    const isNext = entry === next;
    const dot = posted
      ? html`<circle cx="${fixed(px)}" cy="${fixed(py)}" r="2.4" fill="#FCD34D"/>`
      : html`<circle cx="${fixed(px)}" cy="${fixed(py)}" r="${isNext ? 2.4 : 2.1}" fill="#131829" stroke="${isNext ? "#FB923C" : "#7C8598"}" stroke-width="0.8"/>`;
    if (small || room < 7) return dot;
    const rows = room < 14;
    const cy =
      rows && i % 2 === 1
        ? Math.min(py + 39, 96)
        : Math.min(py + 17, rows ? 74 : 96);
    const colors = posted
      ? { fill: "#FCD34D", stroke: "#FCD34D", text: "#0E1220", name: "#F2F4F8" }
      : isNext
        ? {
            fill: "#131829",
            stroke: "#FB923C",
            text: "#F2F4F8",
            name: "#FDBA74",
          }
        : {
            fill: "#1B2236",
            stroke: "#4A5470",
            text: "#C8CEDA",
            name: "#C8CEDA",
          };
    return html`${dot}<g class="sun-face">${cy - 6.4 > py + 3 && html`<path d="M${fixed(px)} ${fixed(py + 3)}V${fixed(cy - 6.4)}" stroke="${posted ? "rgba(252,211,77,0.55)" : "#39425A"}" stroke-width="0.5"/>`}
<circle cx="${fixed(px)}" cy="${fixed(cy)}" r="6.4" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="0.7"/>
<g class="sun-label" font-family="${SANS}" font-weight="600"><text x="${fixed(px)}" y="${fixed(cy + 1.8)}" font-size="4.6" fill="${colors.text}">${initials(name)}</text>
<text x="${fixed(px)}" y="${fixed(cy + 11)}" font-size="3.5" fill="${colors.name}">${firstName(name)}${isNext && " · next"}</text></g>
<text class="sun-label" x="${fixed(px)}" y="${fixed(cy + 15.3)}" font-family="${MONO}" font-size="3.1" fill="${isNext ? "#FDBA74" : "#A3ABBA"}">${localTime(post.dueAt, zone)}</text></g>`;
  }

  const showNow = now !== null && now > from && now < to;
  const nowMark =
    showNow &&
    html`<path d="M${fixed(x(now))} ${TOP - 10}V${HORIZON}" stroke="#FB923C" stroke-width="0.4" stroke-dasharray="1 1"/>
<text class="sun-label" x="${fixed(x(now))}" y="${TOP - 12}" font-family="${MONO}" font-size="3" fill="#FDBA74">now ${localTime(new Date(now), zone)}</text>
${height(now) > 0 && html`<circle class="sun-glow" cx="${fixed(x(now))}" cy="${fixed(y(now))}" r="6" fill="rgba(252,211,77,0.18)"/><circle cx="${fixed(x(now))}" cy="${fixed(y(now))}" r="3.4" fill="#FCD34D"/>`}`;

  const posted = entries.filter(({ post }) => post.status === "sent").length;
  const daylight = sun
    ? `, from sunrise at ${localTime(sun.sunrise, zone)} to sunset at ${localTime(sun.sunset, zone)}`
    : "";
  const label = `The sun's path over ${place(zone)} on ${showDay(chorus.day)}${daylight}. ${count(entries.length, "person takes", "people take")} turns along it, ${posted} posted so far.`;
  return html`<div class="sun-frame">
<svg viewBox="0 0 360 142" role="img" aria-label="${label}"${finished && " data-intro"}>
<g font-family="${MONO}" font-size="2.9" fill="#7C8598" text-anchor="middle">${ticks}${sunLabels}</g>
<path d="M${LEFT} ${HORIZON}H${RIGHT}" stroke="#39425A" stroke-width="0.6"/>
${glow && html`<path d="${glow}" fill="rgba(251,146,60,0.07)">${finished && appearAt(1)}</path>`}
${ahead.length > 1 && html`<path d="${line(ahead)}" fill="none" stroke="#4A5470" stroke-width="0.8" stroke-dasharray="2 2"/>`}
${
  past.length > 1 &&
  (finished
    ? html`<path d="${line(past)}" fill="none" stroke="rgba(251,146,60,0.22)" stroke-width="3.2" stroke-linecap="round" pathLength="1" stroke-dasharray="1">${drawLine()}</path><path d="${line(past)}" fill="none" stroke="#FCD34D" stroke-width="1" stroke-linecap="round" pathLength="1" stroke-dasharray="1">${drawLine()}</path>`
    : html`<path d="${line(past)}" fill="none" stroke="rgba(251,146,60,0.22)" stroke-width="3.2" stroke-linecap="round"/><path d="${line(past)}" fill="none" stroke="#FCD34D" stroke-width="1" stroke-linecap="round"/>`)
}
<g text-anchor="middle">
${nowMark}
${people}
</g>
${finished && past.length > 1 && html`<g opacity="0"><circle r="6" fill="rgba(252,211,77,0.18)"/><circle r="3.4" fill="#FCD34D"/>${travel(line(past))}</g>`}
</svg>
</div>`;
}

// The sun path alone, for a live relay's card on My Choruses.
export function relaySun(chorus: Relay, entries: Entry[]): Html {
  return sunPath(chorus, entries, Date.now(), true);
}

function row(
  entry: Entry,
  chorus: Relay,
  next: Entry | undefined,
  now: number,
): Html {
  const { name, post } = entry;
  const isNext = entry === next;
  return html`<li class="wall-post ${post.status}${isNext && " next"}">
  <span class="avatar">${initials(name)}</span>
  <span class="wall-who"><strong>${shortName(name)}</strong> <span class="muted">${serviceName(post.channelService)}${post.relaySlot !== undefined && ` · ${ordinal(post.relaySlot + 1)}`}</span></span>
  <span class="mono">${localTime(post.dueAt, chorus.relayTz)}</span>
  <span class="wall-state">${isNext ? `Next, in ${inTime(post.dueAt, now)}` : state(post)}</span>
</li>`;
}

// The live relay's sun, full width above the lists like the wave's map. Polled every minute by wall.js.
export function relaySunPanel(chorus: Relay, joined: Joined[]): Html {
  return html`<section class="sun-panel">
  <div class="sun-head">
    <h2 class="sun-title">The sun over ${place(chorus.relayTz)} today</h2>
    <span class="sun-legend" aria-hidden="true"><span class="key posted"></span>Posted <span class="key next"></span>Next <span class="key waiting"></span>Waiting for their turn</span>
  </div>
  ${sunPath(chorus, scheduled(joined), Date.now())}
</section>`;
}

// Everyone in slot order, next to the join box. Polled every minute by wall.js, like the wave's list.
export function relayWall(chorus: Relay, joined: Joined[]): Html {
  const now = Date.now();
  const entries = scheduled(joined);
  const next = nextUp(entries, now);
  const out = entries.filter(({ post }) => post.status === "sent").length;
  const writing = joined.length - entries.length;
  const earlier = entries.filter(({ post }) => post.dueAt.getTime() <= now);
  const later = entries.filter(({ post }) => post.dueAt.getTime() > now);
  const list = (title: string, items: Entry[]) =>
    items.length > 0 &&
    html`<section class="wall-zone">
  <h2 class="zone-title">${title}</h2>
  <ul>${items.map((entry) => row(entry, chorus, next, now))}</ul>
</section>`;
  return html`<p class="wall-count"><strong>${out} of ${entries.length}</strong> ${entries.length === 1 ? "post is" : "posts are"} out${next && html` <span class="muted">· next: ${shortName(next.name)} at ${localTime(next.post.dueAt, chorus.relayTz)}, in ${inTime(next.post.dueAt, now)}</span>`}${writing > 0 && html` <span class="muted">· ${writing === 1 ? "1 person is" : `${writing} people are`} still writing</span>`}</p>
${
  entries.length === 0
    ? html`<p class="empty">No posts are scheduled yet.</p>`
    : html`${list("Earlier today", earlier)}${list("Up next", later)}`
}`;
}

export function relayWallPage(view: ChorusView): Html {
  const { chorus, isOrganizer, post } = view;
  if (!isRelay(chorus)) return html``;
  return html`<div class="page-head">
  <span class="pill accent">Live now · Relay</span>
  <h1>${chorus.title}</h1>
  <p class="mono muted">${showDay(chorus.day)} · ${timing(chorus)}</p>
  ${isOrganizer && html`<a href="/c/${chorus._id}?dashboard" class="small">Open your dashboard</a>`}
</div>
<div data-wall="/c/${chorus._id}/wall?map">
${relaySunPanel(chorus, view.joined)}
</div>
<div class="layout">
<div class="wall" data-wall="/c/${chorus._id}/wall">
${relayWall(chorus, view.joined)}
</div>
<aside class="join-box">
${!post && html`<h2 class="join-heading">There's still time to join</h2>`}
${joinBox(view)}
</aside>
</div>`;
}

// "From 09:00 to 15:00 in Budapest, one every 45 minutes: 6 hours in all." The count is in the line above.
function span(chorus: Relay, sent: Entry[]): string {
  const zone = chorus.relayTz;
  const first = sent[0].post.dueAt;
  const last = sent[sent.length - 1].post.dueAt;
  if (sent.length === 1) {
    return `At ${localTime(first, zone)} in ${place(zone)}.`;
  }
  const minutes = Math.round((last.getTime() - first.getTime()) / MINUTE);
  const hours = Math.floor(minutes / 60);
  const length = [
    hours > 0 && count(hours, "hour", "hours"),
    minutes % 60 > 0 && `${minutes % 60} min`,
  ]
    .filter(Boolean)
    .join(" ");
  const gap =
    chorus.relayGapMin === 60 ? "hour" : `${chorus.relayGapMin} minutes`;
  return `From ${localTime(first, zone)} to ${localTime(last, zone)} in ${place(zone)}, one every ${gap}: ${length} in all.`;
}

function finishedPost(entry: Entry, zone: string): Html {
  const { name, post } = entry;
  const who = shortName(name);
  const network = serviceName(post.channelService);
  const inner = html`<span class="avatar">${initials(name)}</span>
  <span class="finished-who"><strong>${who}</strong> <span class="muted">${place(zone)} · ${network} · ${localTime(post.dueAt, zone)}</span></span>`;
  const link = realLink(post);
  return link
    ? html`<a href="${link}" rel="noopener" class="finished-post" aria-label="Open ${who}'s post on ${network}">${inner}<span class="small">Open post</span></a>`
    : html`<div class="finished-post">${inner}</div>`;
}

// After the day: the whole path in gold, everyone who posted on it, and links to the real posts.
export function relayFinishedPage(view: ChorusView): Html {
  const { chorus, isOrganizer, inviteUrl } = view;
  if (!isRelay(chorus)) return html``;
  const entries = scheduled(view.joined);
  const sent = entries.filter(({ post }) => post.status === "sent");
  const title =
    sent.length === 0
      ? "This Chorus is over."
      : sent.length === entries.length
        ? "Everyone posted."
        : `${sent.length} of ${entries.length} posts went out.`;
  const networks = new Set(sent.map(({ post }) => post.channelService)).size;
  return html`<div class="page-head">
  <span class="pill">Done · Relay · ${showDay(chorus.day)}</span>
  <p class="finished-title">${chorus.title}</p>
  <h1>${title}</h1>
  ${
    sent.length > 0 &&
    html`<p class="finished-stats">${count(sent.length, "voice", "voices")} · ${count(networks, "network", "networks")}</p>
  <p class="muted">${span(chorus, sent)}</p>`
  }
  ${isOrganizer && html`<a href="/c/${chorus._id}?dashboard" class="small">Open your dashboard</a>`}
</div>
<div class="actions inline">
  <input id="link" type="text" readonly value="${inviteUrl}" class="mono finished-link" aria-label="Link to this page">
  <button type="button" class="button" data-copy="link">Copy link</button>
  ${canCreate() && html`<a href="/new" class="button primary">Start your own Chorus</a>`}
</div>
${
  sent.length > 0 &&
  html`<section class="sun-panel">
  <div class="sun-head"><h2 class="sun-title">The sun over ${place(chorus.relayTz)}, and who spoke when</h2></div>
  ${sunPath(chorus, sent, null)}
</section>
<section class="group">
  <h2>${sent.length === 1 ? "The post" : `All ${sent.length} posts, in order`}</h2>
  <div class="finished-list">
${sent.map((entry) => finishedPost(entry, chorus.relayTz))}
  </div>
</section>`
}`;
}
