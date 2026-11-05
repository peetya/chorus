import {
  addDays,
  type Chorus,
  canCreate,
  isLive,
  isOver,
  isRelay,
} from "../choruses.ts";
import { type Html, html } from "../html.ts";
import type { Post } from "../posts.ts";
import { place, shortName, showDay } from "./labels.ts";
import { liveMap, until as timeLeft } from "./map.ts";
import { relaySun } from "./relay.ts";
import { clockAt, timing } from "./when.ts";

// Empty for yesterday: a wave still runs in the last time zones then, so it isn't done yet.
export function until(day: string): string {
  const days = Math.round(
    (Date.parse(day) - Date.parse(addDays(0))) / 86_400_000,
  );
  if (days < 0) return "";
  if (days === 0) return "today";
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

// organizer is null for your own Choruses. people is set only for a live Chorus: its scheduled posts,
// earliest first, for the map or the sun path on its card.
export type MyChorus = {
  chorus: Chorus;
  organizer: string | null;
  people?: { name: string; post: Post & { dueAt: Date } }[];
};

function status(chorus: Chorus, people: NonNullable<MyChorus["people"]>): Html {
  if (people.length === 0)
    return html`<span class="muted">No posts are scheduled yet</span>`;
  const now = new Date();
  const sent = people.filter(({ post }) => post.status === "sent").length;
  const next = people.find(
    ({ post }) => post.status !== "sent" && post.dueAt > now,
  );
  return html`<span><strong class="live-count">${sent} of ${people.length} posted</strong>${next && html`<span class="muted"> · next: ${shortName(next.name)} ${isRelay(chorus) ? html`at ${clockAt(next.post.dueAt, chorus.relayTz, `${place(chorus.relayTz)} time`)}` : `in ${place(next.post.channelTz)}`}, in ${timeLeft(next.post.dueAt, now)}</span>`}</span>`;
}

function card({ chorus, organizer, people }: MyChorus, done: boolean): Html {
  const when = done
    ? `Done · ${showDay(chorus.day)}`
    : isLive(chorus)
      ? `Live now · ${showDay(chorus.day)}`
      : [showDay(chorus.day), until(chorus.day)].filter(Boolean).join(" · ");
  const role = organizer
    ? `You joined · organized by ${shortName(organizer)}`
    : "You organize";
  const text = html`<span class="pill">${when}</span>
  <span class="chorus-title">${chorus.title}</span>
  <span class="muted">${role} · ${isRelay(chorus) ? html`Relay ${timing(chorus)}` : html`at <span class="mono">${chorus.localTime}</span> in each person's time zone`}</span>`;
  if (people) {
    return html`<a href="/c/${chorus._id}" class="chorus-card live">
  <span class="live-text">
  ${text}
  ${status(chorus, people)}
  </span>
  ${isRelay(chorus) ? relaySun(chorus, people) : liveMap(people)}
</a>`;
  }
  return html`<a href="/c/${chorus._id}" class="chorus-card${done && " done"}">
  ${text}
</a>`;
}

function group(title: string, items: MyChorus[], done: boolean): Html | false {
  return (
    items.length > 0 &&
    html`<section class="group">
  <h2>${title}</h2>
  <div class="cards">
${items.map((item) => card(item, done))}
  </div>
</section>`
  );
}

export function myChoruses(items: MyChorus[]): Html {
  const live = items.filter(({ chorus }) => isLive(chorus));
  const coming = items.filter(
    ({ chorus }) => !isOver(chorus) && !isLive(chorus),
  );
  const done = items.filter(({ chorus }) => isOver(chorus)).reverse();
  return html`<div class="page-head row-head">
  <h1>My Choruses</h1>
  ${canCreate() && html`<a href="/new" class="button primary">Start a Chorus</a>`}
</div>
${items.length === 0 && html`<p class="empty">No Choruses yet. Start one, then share its invite link with everyone who should post.</p>`}
${group("Live now", live, false)}
${group("Coming up", coming, false)}
${group("Done", done, true)}`;
}
