import type { Chorus } from "../choruses.ts";
import { type Html, html } from "../html.ts";
import { type Post, WITHDRAW_BEFORE_MS } from "../posts.ts";
import { localDay, localTime, utcOffset, zonedToUtc } from "../time.ts";
import { initials, place, serviceName, shortName, showDay } from "./labels.ts";
import { until } from "./my-choruses.ts";

export type Joined = { name: string; post: Post };

export type ChorusView = {
  chorus: Chorus;
  organizer: string;
  joined: Joined[]; // everyone who joined, in the order they joined
  isOrganizer: boolean;
  post: Post | null; // the viewer's own, once they joined
  over: boolean;
  live: boolean;
  inviteUrl: string;
};

export function joinBox({ chorus, post, over, isOrganizer }: ChorusView): Html {
  const when = html`${showDay(chorus.day)}, at ${chorus.localTime}`;
  if (post?.status === "scheduled" && post.dueAt) {
    const zone = post.channelTz;
    const canWithdraw = post.dueAt.getTime() > Date.now() + WITHDRAW_BEFORE_MS;
    return html`<p class="pill accent">Scheduled</p>
<p class="joined">Your post goes out on <strong>${localDay(post.dueAt, zone)} at ${localTime(post.dueAt, zone)}</strong> ${place(zone)} time, from ${post.channelName} (${serviceName(post.channelService)}).</p>
${
  canWithdraw
    ? html`<form method="post" action="/c/${chorus._id}/post/withdraw"><button type="submit" class="button">Withdraw to change it</button></form>
<p class="muted small">Withdrawing takes it out of your Buffer queue and keeps your text as a draft.</p>`
    : html`<p class="muted small">It goes out in a few minutes, so it can't be changed now.</p>`
}`;
  }
  if (post?.status === "drafted") {
    return html`<p class="pill accent">In your Buffer drafts</p>
<p class="joined">Your post is in the drafts of ${post.channelName} (${serviceName(post.channelService)}), and nothing is published. Schedule or post it from Buffer when you're ready. This page checks about once an hour.</p>
<form method="post" action="/c/${chorus._id}/post/withdraw"><button type="submit" class="button">Take it out of Buffer to change it</button></form>`;
  }
  if (post?.status === "scheduling" || post?.status === "withdrawing") {
    return html`<p>Talking to Buffer. Reload in a moment.</p>`;
  }
  if (over) return html`<p>This Chorus is over. Joining is closed.</p>`;
  if (post) {
    return html`<p class="joined">You're in. Your post goes out from <strong>${post.channelName}</strong> (${serviceName(post.channelService)}) on ${when} ${place(post.channelTz)} time.</p>
<a href="/c/${chorus._id}/post" class="button primary big">${post.text ? "Edit your post" : "Write your post"}</a>
<a href="/c/${chorus._id}/join" class="button">Change channel</a>`;
  }
  return html`<p class="muted">On ${when}, each post goes out at that time in the person's own time zone.</p>
<a href="/c/${chorus._id}/join" class="button primary big">${isOrganizer ? "Pick your channel to post too" : "Join with Buffer"}</a>
<p class="muted small center">Nothing is scheduled until you approve your post.</p>`;
}

function people(names: string[]): Html | false {
  const shown = names.slice(0, 4);
  const more = names.length - shown.length;
  return (
    names.length > 0 &&
    html`<div class="joined-people">
  <div class="avatars">${shown.map((name) => html`<span>${initials(name)}</span>`)}${more > 0 && html`<span>+${more}</span>`}</div>
  <span>${names.length === 1 ? "1 person is in" : `${names.length} people are in`}</span>
</div>`
  );
}

type Standing = "ready" | "drafting" | "look";

function standing(post: Post): Standing {
  if (post.status === "scheduled" || post.status === "sent") return "ready";
  if (post.lastError || post.status === "failed") return "look";
  return "drafting";
}

function statusLabel(post: Post): string {
  if (post.status === "sent") return "Posted";
  if (post.status === "drafted") return "In Buffer drafts";
  const labels = { ready: "Ready", look: "Needs a look", drafting: "" };
  return labels[standing(post)] || (post.text ? "Drafting" : "Not started");
}

// The organizer sees where each post stands and when it goes out, never the text.
function personRow({ name, post }: Joined, chorus: Chorus): Html {
  const zone = post.channelTz;
  const onTheDay = zonedToUtc(chorus.day, chorus.localTime, zone);
  return html`<tr>
  <td>${shortName(name)}${post.userId === chorus.ownerId && html` <span class="muted">(you)</span>`}</td>
  <td>${place(zone)} <span class="mono small muted">${utcOffset(onTheDay, zone)}</span></td>
  <td>${serviceName(post.channelService)}</td>
  <td>${
    post.status === "scheduled" && post.dueAt
      ? html`<span class="mono">${localTime(post.dueAt, zone)}</span>`
      : html`<span class="muted">not scheduled yet</span>`
  }${post.lastError && html`<br><span class="small problem">Buffer refused it: ${post.lastError}</span>`}</td>
  <td><span class="status ${standing(post)}">${statusLabel(post)}</span></td>
</tr>`;
}

function dashboard(view: ChorusView): Html {
  const { chorus, joined, inviteUrl } = view;
  const counts = { ready: 0, drafting: 0, look: 0 };
  for (const { post } of joined) counts[standing(post)]++;
  const waiting = joined
    .filter(({ post }) => post.userId !== chorus.ownerId)
    .filter(({ post }) => standing(post) !== "ready")
    .map(({ name }) => shortName(name));
  const reminder = `A quick reminder: "${chorus.title}" goes out on ${showDay(chorus.day)} at ${chorus.localTime}, in your own time zone. Your post isn't scheduled yet. Write it and approve it here: ${inviteUrl}`;
  return html`<div class="page-head">
  <a href="/me" class="back">My Choruses</a>
  <h1>${chorus.title}</h1>
  <p class="mono muted">${[showDay(chorus.day), `${chorus.localTime} in each person's time zone`, until(chorus.day)].filter(Boolean).join(" · ")}</p>
  ${(view.live || view.over) && html`<a href="/c/${chorus._id}" class="small">${view.live ? "See the live wall" : "See the finished wall"}</a>`}
</div>
<section class="invite-link">
  <label for="invite">Invite link</label>
  <div class="inline">
    <input id="invite" type="text" readonly value="${inviteUrl}" class="mono">
    <button type="button" class="button primary" data-copy="invite">Copy link</button>
  </div>
  <span class="hint">Anyone with this link can join with their own Buffer account.</span>
</section>
<section class="tiles" aria-label="Status">
  <div class="tile ready"><strong>${counts.ready}</strong> ready and scheduled</div>
  <div class="tile"><strong>${counts.drafting}</strong> still writing</div>
  <div class="tile look"><strong>${counts.look}</strong> ${counts.look === 1 ? "needs" : "need"} a look</div>
</section>
<section class="box own-post">
  <h2 class="sub-title">Your post</h2>
  ${joinBox(view)}
</section>
<section class="group">
  <h2>People</h2>
  ${
    joined.length > 0
      ? html`<div class="table-wrap"><table class="people-table">
<thead><tr><th scope="col">Person</th><th scope="col">Time zone</th><th scope="col">Channel</th><th scope="col">Goes out</th><th scope="col">Status</th></tr></thead>
<tbody>
${joined.map((person) => personRow(person, chorus))}
</tbody>
</table></div>
<p class="hint">You see where each post stands. The posts themselves stay private until they go out.</p>`
      : html`<p class="empty">Nobody has joined yet. Share the invite link where your people already talk.</p>`
  }
</section>
${
  waiting.length > 0 &&
  html`<section class="reminder">
  <h2 class="sub-title">${waiting.length === 1 ? "1 person isn't ready yet" : `${waiting.length} people aren't ready yet`}</h2>
  <p class="muted">Send a nudge to ${new Intl.ListFormat("en").format(waiting)}, where your team already talks.</p>
  <textarea id="reminder" class="reminder-text" readonly rows="4">${reminder}</textarea>
  <button type="button" class="button" data-copy="reminder">Copy the reminder</button>
</section>`
}`;
}

export function chorusPage(view: ChorusView): Html {
  const { chorus, organizer, isOrganizer } = view;
  if (isOrganizer) return dashboard(view);
  return html`<div class="invite">
<div class="invite-main">
  <div class="invite-head">
    <p class="muted">${shortName(organizer)} invited you to</p>
    <h1>${chorus.title}</h1>
  </div>
  <span class="pill accent">${showDay(chorus.day)} · ${chorus.localTime} your time</span>
  ${
    chorus.note &&
    html`<figure class="note"><span class="avatar">${initials(organizer)}</span><blockquote>${chorus.note}</blockquote></figure>`
  }
  <div class="brief-cards">
    <div class="box">
      <h2>The facts</h2>
      <ul>
        ${chorus.facts.map((fact) => html`<li>${fact}</li>`)}
        ${chorus.link && html`<li><a href="${chorus.link}" rel="noopener">${chorus.link.replace(/^https?:\/\//, "")}</a></li>`}
      </ul>
      <span class="tags">${chorus.hashtags.map((tag) => html`<span>${tag}</span>`)}</span>
    </div>
    <div class="brief-side">
      ${
        chorus.avoid.length > 0 &&
        html`<div class="box">
        <h2>Please avoid</h2>
        <ul>${chorus.avoid.map((item) => html`<li>${item}</li>`)}</ul>
      </div>`
      }
      <div class="your-part">
        <h2>Your part</h2>
        <p>Write your own post, in your own words. These questions can help you find your angle:</p>
        <ul>${chorus.questions.map((question) => html`<li>${question}</li>`)}</ul>
      </div>
    </div>
  </div>
  ${people(view.joined.map(({ name }) => name))}
</div>
<aside class="join-box">
${joinBox(view)}
</aside>
</div>`;
}

export function chorusNotFound(): Html {
  return html`<h1>This Chorus doesn't exist</h1>
<p>Check the link, or ask the person who sent it for a new one.</p>`;
}
