import type { CheckResult } from "../checks.ts";
import { type Chorus, TONES } from "../choruses.ts";
import { type Html, html } from "../html.ts";
import { MAX_TEXT, type Post } from "../posts.ts";
import { place, serviceName, shortName, showDay } from "./labels.ts";

export function checkList(result: CheckResult): Html {
  return html`<p class="counter${result.length > result.limit && " over"}" data-counter>${result.length.toLocaleString("en")} / ${result.limit.toLocaleString("en")}</p>
<ul class="checks" data-checks>
${result.checks.map((check) => html`<li class="check ${check.level}">${check.text}</li>\n`)}
</ul>`;
}

function brief(chorus: Chorus, organizer: string): Html {
  const name = shortName(organizer);
  // A details block, so on a phone it can fold away above the editor (write.js folds it there).
  return html`<details class="box brief-panel" open data-brief-panel>
  <summary><h2>The brief</h2></summary>
  <div class="brief-body">
  ${chorus.note && html`<div><h3>From ${name}</h3><p>${chorus.note}</p></div>`}
  <div>
    <h3>A few things to think about while you write</h3>
    <ol>${chorus.questions.map((question) => html`<li>${question}</li>`)}</ol>
    <span class="hint">Just a guide. You don't have to answer them.</span>
  </div>
  ${
    chorus.tone !== "any" &&
    html`<div><h3>Tone</h3><p>${name} suggests: <strong>${TONES[chorus.tone].toLowerCase()}</strong>. Write the way you like.</p></div>`
  }
  <div><h3>The facts</h3><ul>${chorus.facts.map((fact) => html`<li>${fact}</li>`)}</ul></div>
  ${
    chorus.avoid.length > 0 &&
    html`<div><h3>Please avoid</h3><ul>${chorus.avoid.map((item) => html`<li>${item}</li>`)}</ul></div>`
  }
  <div><h3>Hashtags${chorus.maxHashtags && ` · at most ${chorus.maxHashtags}`}</h3><span class="tags">${chorus.hashtags.map((tag) => html`<span>${tag}</span>`)}</span></div>
  ${chorus.link && html`<span class="mono small">↗ ${chorus.link.replace(/^https?:\/\//, "")}</span>`}
  </div>
</details>`;
}

export function writePage(
  chorus: Chorus,
  post: Post,
  organizer: string,
  text: string,
  result: CheckResult,
  saved: boolean,
): Html {
  return html`<div class="page-head">
  <a href="/c/${chorus._id}" class="back">${chorus.title}</a>
  <h1>Your post</h1>
</div>
${post.lastError && html`<div class="errors" role="alert"><p>Buffer didn't schedule it: ${post.lastError}</p></div>`}
<div class="layout write-layout">
<form method="post" action="/c/${chorus._id}/post" class="brief write" data-write data-check="/c/${chorus._id}/post/check">
  <div class="post-to">
    <span class="small-label">Post to</span>
    <span><strong>${serviceName(post.channelService)}</strong> · ${post.channelName}</span>
    <a href="/c/${chorus._id}/join" class="small">Change</a>
  </div>
  <div class="field">
    <label for="text">Your post <span class="optional">· in your own words</span></label>
    <textarea id="text" name="text" rows="12" maxlength="${MAX_TEXT}">${text}</textarea>
    <div data-results aria-live="polite">
${checkList(result)}
    </div>
  </div>
  <div class="actions inline">
    <button type="submit" class="button primary" name="action" value="approve">Approve and schedule</button>
    <button type="submit" class="button">Save draft</button>
    ${saved && html`<span class="muted" role="status">Saved.</span>`}
  </div>
</form>
<aside class="side">
${brief(chorus, organizer)}
<section class="goes-out">
  <span class="small-label">Goes out</span>
  <strong>${showDay(chorus.day)}, around ${chorus.localTime}</strong>
  <span class="muted">${place(post.channelTz)} time, from your ${serviceName(post.channelService)} channel in Buffer. Posts in one time zone go out a few minutes apart, so they don't all land at once.</span>
</section>
</aside>
</div>`;
}
