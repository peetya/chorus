import { addDays, type Chorus } from "../choruses.ts";
import { type Html, html } from "../html.ts";

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

function card(chorus: Chorus, done: boolean): Html {
  const when = done
    ? `Done · ${showDay(chorus.day)}`
    : [showDay(chorus.day), until(chorus.day)].filter(Boolean).join(" · ");
  return html`<div class="chorus-card${done && " done"}">
  <span class="pill">${when}</span>
  <span class="chorus-title">${chorus.title}</span>
  <span class="muted">You organize · at <span class="mono">${chorus.localTime}</span> in each person's time zone</span>
</div>`;
}

function group(title: string, items: Chorus[], done: boolean): Html | false {
  return (
    items.length > 0 &&
    html`<section class="group">
  <h2>${title}</h2>
  <div class="cards">
${items.map((chorus) => card(chorus, done))}
  </div>
</section>`
  );
}

export function myChoruses(owned: Chorus[]): Html {
  // A wave runs through every time zone, so it counts as done only the day after.
  const yesterday = addDays(-1);
  const coming = owned.filter((chorus) => chorus.day >= yesterday);
  const done = owned.filter((chorus) => chorus.day < yesterday).reverse();
  return html`<div class="page-head row-head">
  <h1>My Choruses</h1>
  <a href="/new" class="button primary">Start a Chorus</a>
</div>
${owned.length === 0 && html`<p class="empty">No Choruses yet. Start one, then share its invite link with everyone who should post.</p>`}
${group("Coming up", coming, false)}
${group("Done", done, true)}`;
}
