import { type Html, html } from "../html.ts";
import { initials, showDay } from "./labels.ts";

export type AccountView = {
  name: string; // the full name: this page is only for the person
  connected: boolean;
  tokensGoOn: string | null; // a day, or null for "a day after you signed in"
  scheduled: number; // their posts waiting in Buffer
  othersJoined: number; // people who joined Choruses this person organizes
};

export function accountPage(view: AccountView): Html {
  const when = view.tokensGoOn
    ? `one day after your last Chorus is over, on ${showDay(view.tokensGoOn)}`
    : "a day after you signed in, as you're not in any Chorus";
  return html`<div class="account">
<h1>Account</h1>
<section class="box account-who">
  <span class="avatar big">${initials(view.name)}</span>
  <span class="account-name"><span class="muted small-label">Signed in with Buffer as</span><br><strong>${view.name}</strong></span>
  <form method="post" action="/logout"><button type="submit" class="button">Sign out</button></form>
</section>
<section class="box">
  <div class="title-row">
    <h2 class="sub-title">Buffer connection</h2>
    <span class="status ${view.connected ? "look" : "drafting"}">${view.connected ? "Connected" : "Not connected"}</span>
  </div>
  ${
    view.connected
      ? html`<p class="muted">Chorus uses it to schedule the posts you approve and to check when they go out. It's deleted ${when}.</p>
  <ul>
    <li>See your channels</li>
    <li>Create and remove the posts you approve</li>
    <li>Check whether they went out</li>
  </ul>
  <form method="post" action="/account/disconnect" class="actions inline">
    <button type="submit" class="button">Disconnect now</button>
    <span class="hint">Posts already in your Buffer queue still go out. You can also remove Chorus in your Buffer settings.</span>
  </form>`
      : html`<p class="muted">Chorus can't schedule or check posts for you now. Sign in again to connect it.</p>
  <a href="/login?next=/account" class="button primary">Sign in with Buffer</a>`
  }
</section>
<section class="box">
  <h2 class="sub-title">Your data</h2>
  <p class="muted">Removes your account, your drafts and the Choruses you organize from Chorus. Posts that already went out stay on your social accounts.</p>
  ${
    view.scheduled > 0 &&
    html`<p class="problem">${view.scheduled === 1 ? "1 post is" : `${view.scheduled} posts are`} still scheduled in your Buffer queue and will go out. Withdraw ${view.scheduled === 1 ? "it" : "them"} first if you don't want that.</p>`
  }
  ${
    view.othersJoined > 0 &&
    html`<p class="problem">${view.othersJoined === 1 ? "1 person joined" : `${view.othersJoined} people joined`} your Choruses. Their pages go too, but posts already in their Buffer queues still go out.</p>`
  }
  <form method="post" action="/account/delete" class="delete-form">
    <label class="check-line"><input type="checkbox" name="confirm" value="yes" required> Yes, delete my data. This can't be undone.</label>
    <button type="submit" class="button danger">Delete my data</button>
  </form>
</section>
</div>`;
}

export function deletedPage(): Html {
  return html`<h1>Your data is deleted</h1>
<p>Your account, drafts and Choruses are gone from Chorus. Thanks for trying it.</p>
<p><a href="/">Back to the start</a></p>`;
}
