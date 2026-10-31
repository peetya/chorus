import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, choruses } from "../src/choruses.ts";
import { listen, mockSession, useTestDb } from "./server.ts";

process.env.BUFFER_MOCK = "1";
process.env.SESSION_SECRET = "a".repeat(32);
process.env.TOKEN_KEY = "b".repeat(32);
useTestDb();

function start(base: string, cookie: string, title: string) {
  return fetch(`${base}/new`, {
    method: "POST",
    headers: { cookie },
    body: new URLSearchParams([
      ["title", title],
      ["facts", "Tally 2.0 is out today."],
      ["hashtags", "#TallyLaunch"],
      ["questions", "What do you like most?"],
      ["day", addDays(14)],
      ["localTime", "09:00"],
    ]),
    redirect: "manual",
  });
}

async function owned(title: string) {
  return (await choruses()).countDocuments({ title });
}

test("each person runs one Chorus at a time, until the day after it", async (t) => {
  const base = await listen(t);
  const zsofia = await mockSession(base, "mock_zsofia");
  const first = await start(base, zsofia, "First");
  const path = first.headers.get("location") ?? "";
  assert.match(path, /^\/c\//);

  const form = await (
    await fetch(`${base}/new`, { headers: { cookie: zsofia } })
  ).text();
  assert.match(form, /One Chorus at a time/);
  assert.match(form, /<strong>First<\/strong>/);
  assert.ok(form.includes(`<a href="${path}" class="button primary">`));
  const second = await start(base, zsofia, "Second");
  assert.equal(second.status, 409);
  assert.equal(await owned("Second"), 0);

  // Someone else can still start their own.
  const sam = await mockSession(base, "mock_sam");
  assert.equal((await start(base, sam, "Sam's")).status, 303);

  // Yesterday's Chorus still runs in the last time zones, so it still counts.
  const filter = { _id: path.slice(3) };
  await (await choruses()).updateOne(filter, { $set: { day: addDays(-1) } });
  assert.equal((await start(base, zsofia, "Second")).status, 409);
  await (await choruses()).updateOne(filter, { $set: { day: addDays(-2) } });
  assert.equal((await start(base, zsofia, "Second")).status, 303);
  assert.equal(await owned("Second"), 1);
});

test("CHORUS_CREATE=off pauses new Choruses, and joining still works", async (t) => {
  const base = await listen(t);
  const dana = await mockSession(base, "mock_dana");
  const open = (await start(base, dana, "Open")).headers.get("location");
  process.env.CHORUS_CREATE = "off";
  t.after(() => delete process.env.CHORUS_CREATE);

  const aiko = await mockSession(base, "mock_aiko");
  const form = await (
    await fetch(`${base}/new`, { headers: { cookie: aiko } })
  ).text();
  assert.match(form, /New Choruses are paused/);
  assert.equal((await start(base, aiko, "Paused")).status, 409);
  assert.equal(await owned("Paused"), 0);
  const mine = await (
    await fetch(`${base}/me`, { headers: { cookie: aiko } })
  ).text();
  assert.doesNotMatch(mine, /href="\/new"/);

  const join = await fetch(`${base}${open}/join`, {
    headers: { cookie: aiko },
  });
  assert.equal(join.status, 200);
});
