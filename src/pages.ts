import express, { Router } from "express";
import { readSession, type Session } from "./auth.ts";
import { isMock } from "./buffer.ts";
import {
  addDays,
  type Chorus,
  type ChorusInput,
  createChorus,
  LIMITS,
  listOwned,
  parseChorus,
  TONES,
} from "./choruses.ts";
import { escapeHtml, page } from "./html.ts";

export const pages = Router();

const REMOVE_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

function viewer(session: Session) {
  return { name: isMock() ? `${session.name} (mock mode)` : session.name };
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function showDay(day: string): string {
  return DAY.format(new Date(`${day}T00:00:00Z`));
}

// Empty for yesterday: a wave still runs in the last time zones then, so it isn't done yet.
function until(day: string): string {
  const days = Math.round(
    (Date.parse(day) - Date.parse(addDays(0))) / 86_400_000,
  );
  if (days < 0) return "";
  if (days === 0) return "today";
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

function card(chorus: Chorus, done: boolean): string {
  const when = done
    ? `Done · ${showDay(chorus.day)}`
    : [showDay(chorus.day), until(chorus.day)].filter(Boolean).join(" · ");
  return `<div class="chorus-card${done ? " done" : ""}">
  <span class="pill">${escapeHtml(when)}</span>
  <span class="chorus-title">${escapeHtml(chorus.title)}</span>
  <span class="muted">You organize · at <span class="mono">${escapeHtml(chorus.localTime)}</span> in each person's time zone</span>
</div>`;
}

function myChoruses(owned: Chorus[]): string {
  // A wave runs through every time zone, so it counts as done only the day after.
  const yesterday = addDays(-1);
  const coming = owned.filter((chorus) => chorus.day >= yesterday);
  const done = owned.filter((chorus) => chorus.day < yesterday).reverse();
  const section = (title: string, items: Chorus[], isDone: boolean) =>
    items.length
      ? `<section class="group">
  <h2>${title}</h2>
  <div class="cards">
${items.map((chorus) => card(chorus, isDone)).join("\n")}
  </div>
</section>`
      : "";
  const empty = owned.length
    ? ""
    : `<p class="empty">No Choruses yet. Start one, then share its invite link with everyone who should post.</p>`;
  return `<div class="page-head row-head">
  <h1>My Choruses</h1>
  <a href="/new" class="button primary">Start a Chorus</a>
</div>
${empty}
${section("Coming up", coming, false)}
${section("Done", done, true)}`;
}

function rows(
  name: string,
  label: string,
  values: string[],
  marker: "number" | "dash",
): string {
  const row = (value: string, n: number) =>
    `<div class="row"><span class="mark" aria-hidden="true">${marker === "number" ? n : "–"}</span><input type="text" name="${name}" aria-label="${label} ${n}" value="${escapeHtml(value)}" maxlength="200"><button type="button" class="remove" data-remove aria-label="Remove ${label.toLowerCase()} ${n}">${REMOVE_ICON}</button></div>`;
  const shown = values.length ? values : [""];
  return `${shown.map((value, i) => row(value, i + 1)).join("\n")}
<template>${row("", 0)}</template>`;
}

function list(
  name: keyof typeof LIMITS,
  legend: string,
  label: string,
  values: string[],
  add: string,
  hint: string,
  marker: "number" | "dash" = "number",
): string {
  return `<fieldset class="list" data-list data-max="${LIMITS[name]}">
<legend>${legend}</legend>
${rows(name, label, values, marker)}
<button type="button" class="add" data-add>${add}</button>
<span class="hint">${hint}</span>
</fieldset>`;
}

function newChorusForm(input: Partial<ChorusInput>, errors: string[]): string {
  const value = (text?: string) => escapeHtml(text ?? "");
  const errorBox = errors.length
    ? `<div class="errors" role="alert"><p>Please fix these first:</p><ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>`
    : "";
  const tone = input.tone ?? "any";
  const tones = Object.entries(TONES)
    .map(
      ([key, label]) =>
        `<label class="chip"><input type="radio" name="tone" value="${key}"${key === tone ? " checked" : ""}>${label}</label>`,
    )
    .join("\n");
  const maxOptions = ["1", "2", "3", ""]
    .map((n) => {
      const selected = String(input.maxHashtags ?? "") === n ? " selected" : "";
      return `<option value="${n}"${selected}>${n || "No limit"}</option>`;
    })
    .join("");

  return `<div class="page-head">
  <a href="/me" class="back">My Choruses</a>
  <h1>Start a Chorus</h1>
  <p class="muted">Everyone you invite sees this brief next to their editor while they write their own post.</p>
</div>
${errorBox}
<div class="layout">
<form method="post" action="/new" class="brief" data-brief>

<div class="field">
<label for="title">What's happening?</label>
<input id="title" name="title" type="text" required maxlength="120" value="${value(input.title)}">
</div>

<div class="field">
<label for="note">A note to everyone <span class="optional">(optional)</span></label>
<textarea id="note" name="note" rows="3" maxlength="1000">${value(input.note)}</textarea>
<span class="hint">What this is and why it matters to you. Shown on the invite. It is not used as facts in the posts.</span>
</div>

${list("facts", "The facts everyone can use", "Fact", input.facts ?? [], "+ Add a fact", "One short, factual line each. Every post is checked against this list.")}

<div class="field">
<label for="link">Link <span class="optional">(optional)</span></label>
<input id="link" name="link" type="url" placeholder="https://" value="${value(input.link)}">
</div>

<div class="field">
<label for="hashtags">Hashtags</label>
<input id="hashtags" name="hashtags" type="text" class="mono" placeholder="#launchday #buildinpublic" value="${value(input.hashtags?.join(" "))}">
<div class="inline">
<label for="maxHashtags">At most</label>
<select id="maxHashtags" name="maxHashtags">${maxOptions}</select>
<span>hashtags per post</span>
</div>
<span class="hint">The first one goes in every post, so all the posts can be found together. The others are suggestions people can use. Threads allows only one tag, so it gets the first.</span>
</div>

${list("avoid", 'Please avoid <span class="optional">(optional)</span>', "Item", input.avoid ?? [], "+ Add something to avoid", "Topics, words or claims you don't want in any post. Posts that go against this list get flagged.", "dash")}

${list("questions", 'Questions for everyone <span class="optional">(up to 3)</span>', "Question", input.questions ?? [], "+ Add a question", "These help people find their own angle. They show next to the editor as a guide, and the AI uses them if someone asks it for a draft. Nobody has to answer them.")}

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
<input id="day" name="day" type="date" required min="${addDays(-1)}" value="${value(input.day)}">
</div>
<div class="field">
<label for="localTime">Time</label>
<input id="localTime" name="localTime" type="time" required value="${value(input.localTime ?? "09:00")}">
</div>
</div>
<span class="hint">At the same local time everywhere: <span class="mono">09:00</span> in Tokyo, then in Budapest, then in San Francisco. Posts in one time zone go out a few minutes apart, so they don't all land in the same minute.</span>
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

pages.get("/me", async (req, res) => {
  const session = readSession(req);
  if (!session) return res.redirect("/");
  const owned = await listOwned(session.userId);
  res.send(page("My Choruses", myChoruses(owned), { viewer: viewer(session) }));
});

pages.get("/new", (req, res) => {
  const session = readSession(req);
  if (!session) return res.redirect("/login");
  res.send(
    page("Start a Chorus", newChorusForm({}, []), {
      viewer: viewer(session),
      script: "brief.js",
    }),
  );
});

pages.post(
  "/new",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const session = readSession(req);
    if (!session) return res.redirect(303, "/login");
    const { input, errors } = parseChorus(req.body ?? {});
    if (errors.length) {
      return res.status(400).send(
        page("Start a Chorus", newChorusForm(input, errors), {
          viewer: viewer(session),
          script: "brief.js",
        }),
      );
    }
    await createChorus(session.userId, input);
    res.redirect(303, "/me");
  },
);
