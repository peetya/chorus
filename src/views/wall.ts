import { type Html, html } from "../html.ts";
import type { Post } from "../posts.ts";
import { localTime, utcOffset } from "../time.ts";
import { type ChorusView, type Joined, joinBox } from "./chorus.ts";
import { initials, place, serviceName, shortName, showDay } from "./labels.ts";

type Entry = Joined & { post: Post & { dueAt: Date } };

// The link comes from Buffer, but only a plain web link goes into the page.
function realLink(post: Post): string | undefined {
  return post.externalLink?.startsWith("https://")
    ? post.externalLink
    : undefined;
}

function state(post: Post & { dueAt: Date }): Html {
  if (post.status === "sent") {
    const link = realLink(post);
    return link
      ? html`<a href="${link}" rel="noopener">See the post</a>`
      : html`Posted`;
  }
  if (post.status === "failed") return html`Didn't go out`;
  if (post.status === "drafted") return html`In drafts`;
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

function scheduledOnly(joined: Joined[]): Entry[] {
  return joined
    .filter((person): person is Entry => person.post.dueAt !== undefined)
    .sort((a, b) => a.post.dueAt.getTime() - b.post.dueAt.getTime());
}

// Every scheduled post, grouped by time zone, earliest zone first. Polled every minute by wall.js.
export function wallList(joined: Joined[]): Html {
  const entries = scheduledOnly(joined);
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

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// "Tokyo 00:04 UTC to San Francisco 17:11 UTC. 17 h 7 min, following the morning."
function span(sent: Entry[]): string {
  const first = sent[0].post;
  const last = sent[sent.length - 1].post;
  const minutes = Math.round(
    (last.dueAt.getTime() - first.dueAt.getTime()) / 60_000,
  );
  return `${place(first.channelTz)} ${localTime(first.dueAt, "UTC")} UTC to ${place(last.channelTz)} ${localTime(last.dueAt, "UTC")} UTC. ${Math.floor(minutes / 60)} h ${minutes % 60} min, following the morning.`;
}

function finishedPost({ name, post }: Entry): Html {
  const who = shortName(name);
  const network = serviceName(post.channelService);
  const inner = html`<span class="avatar">${initials(name)}</span>
  <span class="finished-who"><strong>${who}</strong> <span class="muted">${place(post.channelTz)} · ${network} · ${localTime(post.dueAt, post.channelTz)}</span></span>`;
  const link = realLink(post);
  return link
    ? html`<a href="${link}" rel="noopener" class="finished-post" aria-label="Open ${who}'s post on ${network}">${inner}<span class="small">Open post</span></a>`
    : html`<div class="finished-post">${inner}</div>`;
}

// After the day: a public record of the wave, with links to the real posts.
export function finishedPage(view: ChorusView): Html {
  const { chorus, isOrganizer, inviteUrl } = view;
  const entries = scheduledOnly(view.joined);
  const sent = entries.filter(({ post }) => post.status === "sent");
  const title =
    sent.length === 0
      ? "This Chorus is over."
      : sent.length === entries.length
        ? "Everyone posted."
        : `${sent.length} of ${entries.length} posts went out.`;
  const networks = new Set(sent.map(({ post }) => post.channelService)).size;
  const zones = new Set(sent.map(({ post }) => post.channelTz)).size;
  return html`<div class="page-head">
  <span class="pill">Done · ${showDay(chorus.day)}</span>
  <p class="finished-title">${chorus.title}</p>
  <h1>${title}</h1>
  ${
    sent.length > 0 &&
    html`<p class="finished-stats">${count(sent.length, "person", "people")} · ${count(networks, "network", "networks")} · ${count(zones, "time zone", "time zones")}</p>
  ${sent.length > 1 && html`<p class="muted">${span(sent)}</p>`}`
  }
  ${isOrganizer && html`<a href="/c/${chorus._id}?dashboard" class="small">Open your dashboard</a>`}
</div>
<div class="actions inline">
  <input id="link" type="text" readonly value="${inviteUrl}" class="mono finished-link" aria-label="Link to this page">
  <button type="button" class="button" data-copy="link">Copy link</button>
  <a href="/new" class="button primary">Start your own Chorus</a>
</div>
${
  sent.length > 0 &&
  html`<section class="group">
  <h2>${sent.length === 1 ? "The post" : `All ${sent.length} posts`}</h2>
  <div class="finished-list">
${sent.map(finishedPost)}
  </div>
</section>`
}`;
}
