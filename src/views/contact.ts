import { type Html, html } from "../html.ts";
import { MAX_MESSAGE, type MessageInput } from "../messages.ts";

export function contactPage(
  input: Partial<MessageInput> = {},
  errors: string[] = [],
): Html {
  return html`<div class="page-head">
  <h1>Contact</h1>
  <p class="muted">A question, an idea, or something about your data? Write here, and you get an answer by email.</p>
</div>
<form method="post" action="/contact" class="box contact">
  ${errors.length > 0 && html`<div class="errors" role="alert"><ul>${errors.map((error) => html`<li>${error}</li>`)}</ul></div>`}
  <div class="field">
    <label for="email">Your email</label>
    <input id="email" name="email" type="email" required maxlength="200" autocomplete="email" value="${input.email}">
    <span class="hint">Only to answer you. Messages are deleted after 6 months.</span>
  </div>
  <div class="field">
    <label for="text">Message</label>
    <textarea id="text" name="text" rows="8" required maxlength="${MAX_MESSAGE}">
${input.text}</textarea>
  </div>
  <div class="honeypot" aria-hidden="true">
    <label for="website">Leave this empty</label>
    <input id="website" name="website" tabindex="-1" autocomplete="off">
  </div>
  <button type="submit" class="button primary">Send</button>
</form>
<p class="muted">To delete what Chorus keeps about you, you don't need to write: your <a href="/account">account page</a> does it right away. Ideas about the code are welcome as <a href="https://github.com/peetya/chorus/issues">GitHub issues</a>.</p>`;
}

export function sentPage(): Html {
  return html`<h1>Thanks, your message is in</h1>
<p>You'll get an answer by email, usually within a few days.</p>
<p><a href="/">Back to the start</a></p>`;
}

export function tooManyPage(): Html {
  return html`<h1>Too many messages today</h1>
<p>A lot of messages came in today. Please try again tomorrow.</p>
<p><a href="/">Back to the start</a></p>`;
}
