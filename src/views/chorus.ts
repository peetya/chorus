import type { Chorus } from "../choruses.ts";
import { type Html, html } from "../html.ts";
import { type Post, WITHDRAW_BEFORE_MS } from "../posts.ts";
import { localDay, localTime } from "../time.ts";
import { initials, place, serviceName, shortName, showDay } from "./labels.ts";

export type ChorusView = {
  chorus: Chorus;
  organizer: string;
  people: string[]; // everyone who joined, in the order they joined
  isOrganizer: boolean;
  post: Post | null; // the viewer's own, once they joined
  over: boolean;
  inviteUrl: string;
};

function joinBox({ chorus, post, over, isOrganizer }: ChorusView): Html {
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

export function chorusPage(view: ChorusView): Html {
  const { chorus, organizer, isOrganizer, inviteUrl } = view;
  return html`${
    isOrganizer &&
    html`<section class="invite-link">
  <label for="invite">Invite link</label>
  <div class="inline">
    <input id="invite" type="text" readonly value="${inviteUrl}" class="mono">
    <button type="button" class="button primary" data-copy="invite">Copy link</button>
  </div>
  <span class="hint">Anyone with this link can join with their own Buffer account.</span>
</section>`
  }
<div class="invite">
<div class="invite-main">
  <div class="invite-head">
    <p class="muted">${isOrganizer ? "You invite people to" : `${shortName(organizer)} invited you to`}</p>
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
  ${people(view.people)}
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
