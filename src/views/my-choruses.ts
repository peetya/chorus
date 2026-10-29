import { addDays, type Chorus } from "../choruses.ts";
import { type Html, html } from "../html.ts";
import { shortName, showDay } from "./labels.ts";

// Empty for yesterday: a wave still runs in the last time zones then, so it isn't done yet.
function until(day: string): string {
  const days = Math.round(
    (Date.parse(day) - Date.parse(addDays(0))) / 86_400_000,
  );
  if (days < 0) return "";
  if (days === 0) return "today";
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

// organizer is null for your own Choruses.
export type MyChorus = { chorus: Chorus; organizer: string | null };

function card({ chorus, organizer }: MyChorus, done: boolean): Html {
  const when = done
    ? `Done · ${showDay(chorus.day)}`
    : [showDay(chorus.day), until(chorus.day)].filter(Boolean).join(" · ");
  const role = organizer
    ? `You joined · organized by ${shortName(organizer)}`
    : "You organize";
  return html`<a href="/c/${chorus._id}" class="chorus-card${done && " done"}">
  <span class="pill">${when}</span>
  <span class="chorus-title">${chorus.title}</span>
  <span class="muted">${role} · at <span class="mono">${chorus.localTime}</span> in each person's time zone</span>
</a>`;
}

function group(title: string, items: MyChorus[], done: boolean): Html | false {
  return (
    items.length > 0 &&
    html`<section class="group">
  <h2>${title}</h2>
  <div class="cards">
${items.map((item) => card(item, done))}
  </div>
</section>`
  );
}

export function myChoruses(items: MyChorus[]): Html {
  // A wave runs through every time zone, so it counts as done only the day after.
  const yesterday = addDays(-1);
  const coming = items.filter(({ chorus }) => chorus.day >= yesterday);
  const done = items.filter(({ chorus }) => chorus.day < yesterday).reverse();
  return html`<div class="page-head row-head">
  <h1>My Choruses</h1>
  <a href="/new" class="button primary">Start a Chorus</a>
</div>
${items.length === 0 && html`<p class="empty">No Choruses yet. Start one, then share its invite link with everyone who should post.</p>`}
${group("Coming up", coming, false)}
${group("Done", done, true)}`;
}
