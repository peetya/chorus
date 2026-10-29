import type { CheckResult } from "../checks.ts";
import type { Chorus } from "../choruses.ts";
import { type Html, html } from "../html.ts";
import type { Post } from "../posts.ts";
import {
  LATE_MINUTES,
  localTime,
  SPREAD_MINUTES,
  zonedToUtc,
} from "../time.ts";
import { place, serviceName, showDay } from "./labels.ts";
import { checkList } from "./write.ts";

// One last look before Buffer gets it: the post, the checks, and when it goes out.
export function reviewPage(
  chorus: Chorus,
  post: Post,
  result: CheckResult,
): Html {
  const blocked = result.checks.some((check) => check.level === "block");
  const planned = zonedToUtc(
    chorus.day,
    chorus.localTime,
    post.channelTz,
  ).getTime();
  const late = planned < Date.now() + LATE_MINUTES * 60_000;
  return html`<div class="page-head">
  <a href="/c/${chorus._id}/post" class="back">Back to editing</a>
  <h1>Check it before it's scheduled</h1>
  <p class="muted">Read it once more against the brief. Warnings are fine if you're sure.</p>
</div>
<div class="review">
  <div class="review-post">${post.text ?? ""}</div>
  <div data-results>
${checkList(result)}
  </div>
  ${
    late
      ? html`<p>Your ${chorus.localTime} on ${showDay(chorus.day)} has passed in ${place(post.channelTz)}, so it goes out a few minutes after you schedule it, from ${post.channelName} (${serviceName(post.channelService)}).</p>`
      : html`<p>It goes out on <strong>${showDay(chorus.day)}</strong>, between <strong>${chorus.localTime}</strong> and <strong>${localTime(new Date(planned + SPREAD_MINUTES * 60_000), post.channelTz)}</strong> ${place(post.channelTz)} time, from ${post.channelName} (${serviceName(post.channelService)}).</p>`
  }
  ${
    blocked
      ? html`<p class="errors" role="alert">Fix the marked problem first, then come back here.</p>
<div class="actions inline"><a href="/c/${chorus._id}/post" class="button primary">Back to editing</a></div>`
      : html`<form method="post" action="/c/${chorus._id}/post/approve" class="actions inline">
  <button type="submit" class="button primary">Schedule it in Buffer</button>
  <a href="/c/${chorus._id}/post" class="button">Back to editing</a>
</form>`
  }
</div>`;
}
