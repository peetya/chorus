import assert from "node:assert/strict";
import { test } from "node:test";
import { placeOf, sunHeight, sunTimes } from "../src/sunrise.ts";

function minutesOff(at: Date, expected: string): number {
  return Math.abs(at.getTime() - Date.parse(expected)) / 60_000;
}

test("sunrise and sunset in Budapest on 11 November", () => {
  const times = sunTimes("2026-11-11", "Europe/Budapest");
  assert.ok(times);
  // About 06:43 and 16:14 Budapest time (UTC+1), with noon by the sun at 11:28.
  assert.ok(minutesOff(times.sunrise, "2026-11-11T05:43:00Z") <= 5);
  assert.ok(minutesOff(times.sunset, "2026-11-11T15:14:00Z") <= 5);
});

test("the sun is high at noon and down at midnight", () => {
  const { lat, lon } = placeOf("Europe/Budapest");
  assert.ok(sunHeight(new Date("2026-11-11T10:50:00Z"), lat, lon) > 20);
  assert.ok(sunHeight(new Date("2026-11-11T23:00:00Z"), lat, lon) < -30);
});

test("no sunrise in the polar night or the midnight sun", () => {
  assert.equal(sunTimes("2026-11-11", "Arctic/Longyearbyen"), null);
  assert.equal(sunTimes("2026-06-21", "Arctic/Longyearbyen"), null);
});
