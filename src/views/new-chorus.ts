import {
  addDays,
  type Chorus,
  type ChorusInput,
  LIMITS,
  TONES,
} from "../choruses.ts";
import { type Html, html, raw } from "../html.ts";
import { showDay } from "./labels.ts";

const REMOVE_ICON = raw(
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
);

function row(
  name: string,
  label: string,
  value: string,
  n: number,
  marker: "number" | "dash",
): Html {
  return html`<div class="row"><span class="mark" aria-hidden="true">${marker === "number" ? n : "–"}</span><input type="text" name="${name}" aria-label="${label} ${n}" value="${value}" maxlength="200"><button type="button" class="remove" data-remove aria-label="Remove ${label.toLowerCase()} ${n}">${REMOVE_ICON}</button></div>`;
}

// One row per value (at least one, so there is somewhere to type), and a template for brief.js to copy.
function list(
  name: keyof typeof LIMITS,
  legend: string | Html,
  label: string,
  values: string[],
  add: string,
  hint: string,
  marker: "number" | "dash" = "number",
): Html {
  const shown = values.length ? values : [""];
  return html`<fieldset class="list" data-list data-max="${LIMITS[name]}">
<legend>${legend}</legend>
${shown.map((value, i) => row(name, label, value, i + 1, marker))}
<template>${row(name, label, "", 0, marker)}</template>
<button type="button" class="add" data-add>${add}</button>
<span class="hint">${hint}</span>
</fieldset>`;
}

export function newChorusForm(
  input: Partial<ChorusInput>,
  errors: string[],
): Html {
  const errorBox =
    errors.length > 0 &&
    html`<div class="errors" role="alert"><p>Please fix these first:</p><ul>${errors.map((error) => html`<li>${error}</li>`)}</ul></div>`;
  const tone = input.tone ?? "any";
  const tones = Object.entries(TONES).map(
    ([key, label]) =>
      html`<label class="chip"><input type="radio" name="tone" value="${key}"${key === tone && " checked"}>${label}</label>\n`,
  );
  const maxOptions = ["1", "2", "3", ""].map(
    (n) =>
      html`<option value="${n}"${String(input.maxHashtags ?? "") === n && " selected"}>${n || "No limit"}</option>`,
  );

  return html`<div class="page-head">
  <a href="/me" class="back">My Choruses</a>
  <h1>Start a Chorus</h1>
  <p class="muted">Everyone you invite sees this brief next to their editor while they write their own post.</p>
</div>
${errorBox}
<div class="layout">
<form method="post" action="/new" class="brief" data-brief>

<div class="field">
<label for="title">What's happening?</label>
<input id="title" name="title" type="text" required maxlength="120" value="${input.title}">
</div>

<div class="field">
<label for="note">A note to everyone <span class="optional">(optional)</span></label>
<textarea id="note" name="note" rows="3" maxlength="1000">${input.note}</textarea>
<span class="hint">What this is and why it matters to you. Shown on the invite. It is not used as facts in the posts.</span>
</div>

${list("facts", "The facts everyone can use", "Fact", input.facts ?? [], "+ Add a fact", "One short, factual line each. Every post is checked against this list.")}

<div class="field">
<label for="link">Link <span class="optional">(optional)</span></label>
<input id="link" name="link" type="url" placeholder="https://" value="${input.link}">
</div>

<div class="field">
<label for="hashtags">Hashtags</label>
<input id="hashtags" name="hashtags" type="text" class="mono" placeholder="#launchday #buildinpublic" value="${input.hashtags?.join(" ")}">
<div class="inline">
<label for="maxHashtags">At most</label>
<select id="maxHashtags" name="maxHashtags">${maxOptions}</select>
<span>hashtags per post</span>
</div>
<span class="hint">The first one goes in every post, so all the posts can be found together. The others are suggestions people can use. Threads allows only one tag, so it gets the first.</span>
</div>

${list("avoid", html`Please avoid <span class="optional">(optional)</span>`, "Item", input.avoid ?? [], "+ Add something to avoid", "Topics, words or claims you don't want in any post. Posts that go against this list get flagged.", "dash")}

${list("questions", html`Questions for everyone <span class="optional">(up to 3)</span>`, "Question", input.questions ?? [], "+ Add a question", "These help people find their own angle. They show next to the editor as a guide, and the AI uses them if someone asks it for a draft. Nobody has to answer them.")}

<fieldset class="choices">
<legend>Tone</legend>
<div class="chips">
${tones}
</div>
<span class="hint">A hint for everyone, not a rule. People see it next to the editor. "Let everyone choose" is the default and shows no hint.</span>
</fieldset>

<div class="field">
<div class="when">
<div class="field">
<label for="day">Day</label>
<input id="day" name="day" type="date" required min="${addDays(-1)}" value="${input.day}">
</div>
<div class="field">
<label for="localTime">Time</label>
<input id="localTime" name="localTime" type="time" required value="${input.localTime ?? "09:00"}">
</div>
</div>
<span class="hint">At the same local time everywhere: <span class="mono" data-time-hint>${input.localTime ?? "09:00"}</span> in Tokyo, then in Budapest, then in San Francisco. Posts in one time zone go out a few minutes apart, so they don't all land in the same minute.</span>
</div>

<div class="actions">
<button type="submit" class="button primary">Start Chorus</button>
</div>
</form>

<aside class="side">
<section class="fact-card" aria-live="polite">
<div class="fact-card-head"><h2>Fact card</h2><span class="mono muted small">updates as you type</span></div>
<ol data-card-facts></ol>
<div data-card-tags hidden><span class="small-label"></span><span class="tags"></span></div>
<div data-card-avoid hidden><span class="small-label">Please avoid</span><ul></ul></div>
<p class="card-foot">Everything else in each post is personal. A post that claims something not on this card gets flagged before anyone approves it. So does a post that is almost the same as someone else's.</p>
</section>
</aside>
</div>`;
}

// open: the person's own Chorus that isn't over yet. null: new Choruses are paused for everyone.
export function cantStart(open: Chorus | null): Html {
  return html`<div class="page-head">
  <a href="/me" class="back">My Choruses</a>
  <h1>${open ? "One Chorus at a time" : "New Choruses are paused"}</h1>
</div>
<section class="box narrow-box">
${
  open
    ? html`<p>You already have a Chorus coming up: <strong>${open.title}</strong>, on ${showDay(open.day)}. You can start a new one the day after it's over.</p>
<p class="muted">Buffer's API has a daily limit for the whole app, so each person runs one Chorus at a time.</p>
<a href="/c/${open._id}" class="button primary">Open your Chorus</a>`
    : html`<p>Starting a new Chorus is paused for now, so the Chorus that's running gets all of Buffer's daily API limit. Joining a Chorus works as usual.</p>
<p class="muted">Try again in a day or two.</p>
<a href="/me" class="button">Back to My Choruses</a>`
}
</section>`;
}
