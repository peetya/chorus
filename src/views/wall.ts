import { type Html, html } from "../html.ts";
import type { Post } from "../posts.ts";
import { localTime, utcOffset } from "../time.ts";
import { type ChorusView, type Joined, joinBox } from "./chorus.ts";
import { initials, place, serviceName, shortName, showDay } from "./labels.ts";

type Entry = Joined & { post: Post & { dueAt: Date } };

function state(post: Post & { dueAt: Date }): Html {
  if (post.status === "sent") {
    // The link comes from Buffer, but only a plain web link goes into the page.
    return post.externalLink?.startsWith("https://")
      ? html`<a href="${post.externalLink}" rel="noopener">See the post</a>`
      : html`Posted`;
  }
  if (post.status === "failed") return html`Didn't go out`;
  if (post.dueAt.getTime() > Date.now()) return html`Scheduled`;
  return post.nextCheckAt ? html`Going out` : html`Not confirmed by Buffer`;
}

function entry({ name, post }: Entry): Html {
  return html`<li class="wall-post ${post.status}">
  <span class="avatar">${initials(name)}</span>
  <span class="wall-who"><strong>${shortName(name)}</strong> <span class="muted">${serviceName(post.channelService)}</span></span>
  <span class="mono">${localTime(post.dueAt, post.channelTz)}</span>
  <span class="wall-state">${state(post)}</span>
</li>`;
}

// Every scheduled post, grouped by time zone, earliest zone first. Polled every minute by wall.js.
export function wallList(joined: Joined[]): Html {
  const entries = joined
    .filter((person): person is Entry => person.post.dueAt !== undefined)
    .sort((a, b) => a.post.dueAt.getTime() - b.post.dueAt.getTime());
  const zones = new Map<string, Entry[]>();
  for (const item of entries) {
    zones.set(item.post.channelTz, [
      ...(zones.get(item.post.channelTz) ?? []),
      item,
    ]);
  }
  const out = entries.filter(({ post }) => post.status === "sent").length;
  const writing = joined.length - entries.length;
  return html`<p class="wall-count"><strong>${out} of ${entries.length}</strong> ${entries.length === 1 ? "post is" : "posts are"} out${writing > 0 && html` <span class="muted">· ${writing === 1 ? "1 person is" : `${writing} people are`} still writing</span>`}</p>
${
  entries.length === 0
    ? html`<p class="empty">No posts are scheduled yet.</p>`
    : [...zones].map(
        ([zone, items]) => html`<section class="wall-zone">
  <h2 class="zone-title">${place(zone)} <span class="mono small muted">${utcOffset(items[0].post.dueAt, zone)}</span></h2>
  <ul>${items.map(entry)}</ul>
</section>`,
      )
}`;
}

export function wallPage(view: ChorusView): Html {
  const { chorus, isOrganizer, post } = view;
  return html`<div class="page-head">
  <span class="pill accent">Live now</span>
  <h1>${chorus.title}</h1>
  <p class="mono muted">${showDay(chorus.day)} · ${chorus.localTime} in each person's time zone</p>
  ${isOrganizer && html`<a href="/c/${chorus._id}?dashboard" class="small">Open your dashboard</a>`}
</div>
<div class="layout">
<div class="wall" data-wall="/c/${chorus._id}/wall">
${wallList(view.joined)}
</div>
<aside class="join-box">
${!post && html`<h2 class="join-heading">There's still time to join</h2>`}
${joinBox(view)}
</aside>
</div>`;
}
