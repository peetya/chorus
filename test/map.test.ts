import assert from "node:assert/strict";
import { test } from "node:test";
import type { Post } from "../src/posts.ts";
import { daylightPath, sunOverhead } from "../src/sun.ts";
import { finishedMap, liveMap } from "../src/views/map.ts";

// How high the sun is at a place, from where it's overhead: above 0 means day.
function sunHeight(lat: number, lon: number, at: Date): number {
  const r = Math.PI / 180;
  const sun = sunOverhead(at);
  return (
    Math.asin(
      Math.sin(lat * r) * Math.sin(sun.lat * r) +
        Math.cos(lat * r) *
          Math.cos(sun.lat * r) *
          Math.cos((lon - sun.lon) * r),
    ) / r
  );
}

test("the sun is overhead where the almanac says", () => {
  const june = sunOverhead(new Date("2026-06-21T12:00:00Z"));
  assert.ok(Math.abs(june.lat - 23.44) < 0.3, `${june.lat}`);
  const december = sunOverhead(new Date("2026-12-21T12:00:00Z"));
  assert.ok(Math.abs(december.lat + 23.44) < 0.3, `${december.lat}`);
  // Early November the sun runs about 16 minutes ahead of the clock: noon by the sun is west of Greenwich.
  const november = sunOverhead(new Date("2026-11-03T12:00:00Z"));
  assert.ok(Math.abs(november.lon + 4.1) < 0.5, `${november.lon}`);
  const night = sunOverhead(new Date("2026-11-03T00:00:00Z"));
  assert.ok(Math.abs(Math.abs(night.lon) - 176) < 1, `${night.lon}`);
});

test("Budapest has daylight on Nov 11 from about 05:45 to 15:10 UTC", () => {
  const at = (time: string) => new Date(`2026-11-11T${time}:00Z`);
  assert.ok(sunHeight(47.5, 19.1, at("05:30")) < 0);
  assert.ok(sunHeight(47.5, 19.1, at("06:15")) > 0);
  assert.ok(sunHeight(47.5, 19.1, at("15:00")) > 0);
  assert.ok(sunHeight(47.5, 19.1, at("15:40")) < 0);
});

test("the lit side closes along the pole that has the sun", () => {
  assert.match(
    daylightPath(new Date("2026-06-21T12:00:00Z")),
    /^M0 -2L.*L360 -2Z$/,
  );
  assert.match(
    daylightPath(new Date("2026-11-11T12:00:00Z")),
    /^M0 146L.*L360 146Z$/,
  );
});

function entry(
  name: string,
  channelTz: string,
  dueAt: string,
  status: Post["status"],
) {
  return {
    name,
    post: { channelTz, dueAt: new Date(dueAt), status } as Post & {
      dueAt: Date;
    },
  };
}

const wave = [
  entry("Aiko Tanaka", "Asia/Tokyo", "2026-11-11T00:04:00Z", "sent"),
  entry("Zsófia Kiss", "Europe/Budapest", "2026-11-11T08:00:00Z", "sent"),
  entry("Márk Varga", "Europe/Budapest", "2026-11-11T08:02:00Z", "sent"),
  entry("Dana Rossi", "America/New_York", "2026-11-11T14:00:00Z", "scheduled"),
  entry(
    "Sam Walker",
    "America/Los_Angeles",
    "2026-11-11T17:00:00Z",
    "scheduled",
  ),
];

test("the live map lights the places that posted and rings the next one", () => {
  const map = liveMap(wave, new Date("2026-11-11T13:13:00Z")).value;
  assert.match(map, /src="\/world.svg"/);
  assert.match(map, /World map at 13:13 UTC/);
  assert.match(map, /Posted from Tokyo, Budapest \(2 people\)\./);
  assert.match(map, /Next: New York, in 47 min\./);
  assert.match(map, />New York · next, 47 min</);
  // Budapest: one lit dot with the number 2 on it.
  assert.match(map, /<circle cx="199.1" cy="36.5" r="3.6" fill="#FCD34D"\/>/);
  assert.match(map, />2<\/text>/);
  assert.equal((map.match(/href="#bubble"/g) ?? []).length, 2);
});

test("the finished map draws the route in the order the posts went out", () => {
  const done = wave.map((item) => ({
    ...item,
    post: { ...item.post, status: "sent" as const },
  }));
  const map = finishedMap(done).value;
  assert.match(map, /Tokyo, Budapest \(2 people\), New York, Los Angeles\./);
  assert.match(map, /d="M319.7 48.3L199.1 36.5L/);
  assert.match(map, />Tokyo · first, 00:04 UTC</);
  assert.match(map, />Los Angeles · last, 17:00 UTC</);
  // The line draws itself, and each place appears when it gets there: Tokyo first, Los Angeles last.
  assert.match(map, /data-intro/);
  assert.match(map, /pathLength="1" stroke-dasharray="1"/);
  const reached = [...map.matchAll(/keyTimes="0;([\d.]+);/g)].map(([, at]) =>
    Number(at),
  );
  assert.equal(reached[0], 0);
  assert.ok(reached.every((at, i) => i === 0 || at >= reached[i - 1]));
});

test("a time zone the list doesn't know goes on the equator at its offset", () => {
  const map = liveMap(
    [entry("Ravi Kumar", "Asia/Calcutta", "2026-11-11T03:30:00Z", "sent")],
    new Date("2026-11-11T04:00:00Z"),
  ).value;
  assert.match(map, /cx="262.5" cy="84"/);
});
