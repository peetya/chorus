import { type Chorus, isRelay } from "../choruses.ts";
import { type Html, html } from "../html.ts";
import { localTime, zonedToUtc } from "../time.ts";
import { place } from "./labels.ts";

// A time in a place's own time zone, like "13:45 Los Angeles time" with `after`. your-time.js adds the
// reader's own time after it when they're somewhere else ("22:45 your time"). Without JS it stands alone.
export function clockAt(at: Date, zone: string, after?: string): Html {
  return html`<time datetime="${at.toISOString()}" data-zone="${zone}">${localTime(at, zone)}${after && ` ${after}`}</time>`;
}

function every(chorus: Chorus): string {
  return chorus.relayGapMin === 60 ? "hour" : `${chorus.relayGapMin} min`;
}

// "09:00 in each person's time zone", or for a relay "from 09:00 Budapest time, a new voice every 45 min".
export function timing(chorus: Chorus): Html {
  if (!isRelay(chorus))
    return html`${chorus.localTime} in each person's time zone`;
  const start = zonedToUtc(chorus.day, chorus.localTime, chorus.relayTz);
  return html`from ${clockAt(start, chorus.relayTz, `${place(chorus.relayTz)} time`)}, a new voice every ${every(chorus)}`;
}

// The same as plain text, for a message people copy.
export function timingText(chorus: Chorus): string {
  if (!isRelay(chorus)) return `${chorus.localTime} in each person's time zone`;
  return `from ${chorus.localTime} ${place(chorus.relayTz)} time, a new voice every ${every(chorus)}`;
}
