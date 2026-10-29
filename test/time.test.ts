import assert from "node:assert/strict";
import { test } from "node:test";
import { localTime, waveDueAt, zonedToUtc } from "../src/time.ts";

test("09:00 local becomes the right UTC moment around the world", () => {
  const at = (zone: string) =>
    zonedToUtc("2026-11-19", "09:00", zone).toISOString();
  assert.equal(at("Asia/Tokyo"), "2026-11-19T00:00:00.000Z");
  assert.equal(at("Asia/Kolkata"), "2026-11-19T03:30:00.000Z");
  assert.equal(at("Europe/Budapest"), "2026-11-19T08:00:00.000Z");
  assert.equal(at("America/Los_Angeles"), "2026-11-19T17:00:00.000Z");
  assert.equal(at("Pacific/Kiritimati"), "2026-11-18T19:00:00.000Z"); // UTC+14
});

test("DST is handled on the day it changes", () => {
  // New York leaves DST on Sun Nov 1 2026: 09:00 that day is UTC-5, the day before UTC-4.
  assert.equal(
    zonedToUtc("2026-10-31", "09:00", "America/New_York").toISOString(),
    "2026-10-31T13:00:00.000Z",
  );
  assert.equal(
    zonedToUtc("2026-11-01", "09:00", "America/New_York").toISOString(),
    "2026-11-01T14:00:00.000Z",
  );
  // Budapest skips 02:00 to 03:00 on Mar 29 2026: 02:30 doesn't exist and moves to 03:30.
  const skipped = zonedToUtc("2026-03-29", "02:30", "Europe/Budapest");
  assert.equal(localTime(skipped, "Europe/Budapest"), "03:30");
});

test("a wave post goes out a few minutes after the Chorus time, or soon if that has passed", () => {
  const nine = zonedToUtc("2026-11-19", "09:00", "Asia/Tokyo").getTime();
  const early = Date.parse("2026-11-01T00:00:00Z");
  assert.equal(
    waveDueAt("2026-11-19", "09:00", "Asia/Tokyo", early, () => 0).getTime(),
    nine,
  );
  assert.equal(
    waveDueAt(
      "2026-11-19",
      "09:00",
      "Asia/Tokyo",
      early,
      () => 0.999,
    ).getTime(),
    nine + 12 * 60_000,
  );
  const late = nine + 3 * 3600_000;
  assert.equal(
    waveDueAt("2026-11-19", "09:00", "Asia/Tokyo", late, () => 0).getTime(),
    late + 5 * 60_000,
  );
});
