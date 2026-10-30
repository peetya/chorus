// Wall-clock time in a time zone, to UTC and back. Only Intl and IANA zone names, never offsets by hand:
// DST moves them twice a year, on different days in different countries.

function offsetMs(utc: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(utc)
      .map((part) => [part.type, Number(part.value)]),
  );
  const local = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return local - Math.floor(utc / 1000) * 1000;
}

// "2026-11-19" at "09:00" in "America/New_York" -> the UTC moment. A time that doesn't exist (the hour
// skipped when clocks go forward) moves forward by that hour, like a wall clock would.
export function zonedToUtc(day: string, time: string, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  const first = wall - offsetMs(wall, timeZone);
  const second = wall - offsetMs(first, timeZone);
  return new Date(Math.max(first, second));
}

// "09:07" in that time zone.
export function localTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

// "Thu 19 Nov" in that time zone.
export function localDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(at);
}

// "UTC+5:30" in that time zone at that moment.
export function utcOffset(at: Date, timeZone: string): string {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  return name && name !== "GMT" ? name.replace("GMT", "UTC") : "UTC+0";
}

export const SPREAD_MINUTES = 12;
export const LATE_MINUTES = 5;

// When a wave post goes out: the Chorus time in the person's own zone, plus a few random minutes so
// posts in one zone don't land in the same minute. If that time has passed (a late joiner), a few
// minutes after approving instead.
export function waveDueAt(
  day: string,
  time: string,
  timeZone: string,
  now = Date.now(),
  random = Math.random,
): Date {
  const spread = Math.floor(random() * (SPREAD_MINUTES + 1)) * 60_000;
  const planned = zonedToUtc(day, time, timeZone).getTime() + spread;
  return new Date(Math.max(planned, now + LATE_MINUTES * 60_000));
}
