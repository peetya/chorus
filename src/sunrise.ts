// Sunrise, sunset and the sun's height for a relay's city, built on sunOverhead.
import { sunOverhead } from "./sun.ts";
import { zonedToUtc } from "./time.ts";
import { PLACES } from "./zones.ts";

const RAD = Math.PI / 180;

// The sun's centre is this far below the horizon at sunrise: air bends the light, and the sun is a disc.
const RISE = -0.833;

// A time zone's main city. Relay zones are checked against this list when the Chorus is made.
export function placeOf(zone: string): { lat: number; lon: number } {
  const [x, y] = PLACES[zone] ?? [180, 84];
  return { lat: 84 - y, lon: x - 180 };
}

// How high the sun is over a place, in degrees. Below 0 it's under the horizon.
export function sunHeight(at: Date, lat: number, lon: number): number {
  const sun = sunOverhead(at);
  const sin =
    Math.sin(lat * RAD) * Math.sin(sun.lat * RAD) +
    Math.cos(lat * RAD) *
      Math.cos(sun.lat * RAD) *
      Math.cos((lon - sun.lon) * RAD);
  return Math.asin(sin) / RAD;
}

// Sunrise and sunset in the zone's main city on that day, to the minute. Null when the sun stays up or
// stays down all day (far north or south). A minute-by-minute walk is 1,440 small sums, quick enough.
export function sunTimes(
  day: string,
  zone: string,
): { sunrise: Date; sunset: Date } | null {
  const { lat, lon } = placeOf(zone);
  const start = zonedToUtc(day, "00:00", zone).getTime();
  const up = (at: number) => sunHeight(new Date(at), lat, lon) > RISE;
  let sunrise: number | undefined;
  let sunset: number | undefined;
  let wasUp = up(start);
  for (let at = start + 60_000; at < start + 86_400_000; at += 60_000) {
    const isUp = up(at);
    if (isUp && !wasUp) sunrise ??= at;
    if (!isUp && wasUp) sunset = at;
    wasUp = isUp;
  }
  return sunrise && sunset
    ? { sunrise: new Date(sunrise), sunset: new Date(sunset) }
    : null;
}
