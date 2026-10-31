import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, choruses, plusDays } from "../src/choruses.ts";
import { dailyCleanup } from "../src/cleanup.ts";
import { posts } from "../src/posts.ts";
import { users } from "../src/users.ts";
import { showDay } from "../src/views/labels.ts";
import { listen, mockSession, useTestDb } from "./server.ts";

process.env.BUFFER_MOCK = "1";
process.env.SESSION_SECRET = "a".repeat(32);
process.env.TOKEN_KEY = "b".repeat(32);
useTestDb();

function post(
  base: string,
  path: string,
  cookie: string,
  fields: string[][] = [],
) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { cookie },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });
}

async function startChorus(base: string, cookie: string, day: string) {
  const res = await post(base, "/new", cookie, [
    ["title", "Northwind ships Tally 2.0"],
    ["facts", "Tally 2.0 is out today."],
    ["hashtags", "#TallyLaunch"],
    ["questions", "What do you like most?"],
    ["day", day],
    ["localTime", "09:00"],
  ]);
  return res.headers.get("location") ?? "";
}

async function join(
  base: string,
  path: string,
  cookie: string,
  channel: string,
) {
  await post(base, `${path}/join`, cookie, [["channelId", channel]]);
  await post(base, `${path}/post`, cookie, [
    ["text", `Mine, on ${channel}. #TallyLaunch`],
  ]);
}

async function userOf(person: string) {
  return (await users()).findOne({ providerAccountId: person });
}

test("the account page says when the connection goes, and disconnect works", async (t) => {
  const base = await listen(t);
  const zsofia = await mockSession(base, "mock_zsofia");
  const day = addDays(14);
  const path = await startChorus(base, zsofia, day);
  await join(base, path, zsofia, "ch_zsofia_li");
  await post(base, `${path}/post/approve`, zsofia);
  const sam = await mockSession(base, "mock_sam");
  await join(base, path, sam, "ch_sam_li");

  const page = await (
    await fetch(`${base}/account`, { headers: { cookie: zsofia } })
  ).text();
  assert.match(page, /<strong>Zsófia Kiss<\/strong>/);
  assert.match(page, />Connected</);
  assert.ok(page.includes(`on ${showDay(plusDays(day, 3))}`));
  assert.match(page, /1 post is still scheduled in your Buffer queue/);
  assert.match(page, /1 person joined your Choruses/);

  await post(base, "/account/disconnect", zsofia);
  assert.equal((await userOf("mock_zsofia"))?.tokenEnc, undefined);
  const after = await (
    await fetch(`${base}/account`, { headers: { cookie: zsofia } })
  ).text();
  assert.match(after, />Not connected</);

  // A page that needs Buffer now asks to sign in again instead of failing.
  // One open Chorus per person: the first one is over (but not cleaned up yet) before she starts another.
  await (await choruses()).updateOne(
    { _id: path.slice(3) },
    { $set: { day: addDays(-2) } },
  );
  const fresh = await startChorus(base, zsofia, addDays(20));
  const join2 = await fetch(`${base}${fresh}/join`, {
    headers: { cookie: zsofia },
  });
  assert.equal(join2.status, 401);
  assert.match(await join2.text(), /Sign in again/);
});

test("delete my data removes the person, their posts and their Choruses", async (t) => {
  const base = await listen(t);
  const dana = await mockSession(base, "mock_dana");
  const own = await startChorus(base, dana, addDays(10));
  const aiko = await mockSession(base, "mock_aiko");
  await join(base, own, aiko, "ch_aiko_li");
  const maya = await mockSession(base, "mock_maya");
  const other = await startChorus(base, maya, addDays(12));
  await join(base, other, dana, "ch_dana_li");

  const unchecked = await post(base, "/account/delete", dana);
  assert.equal(unchecked.headers.get("location"), "/account");
  assert.ok(await userOf("mock_dana"));

  const res = await post(base, "/account/delete", dana, [["confirm", "yes"]]);
  assert.match(await res.text(), /Your data is deleted/);
  assert.match(res.headers.get("set-cookie") ?? "", /chorus_session=;/);
  const user = await userOf("mock_dana");
  assert.equal(user, null);
  assert.equal(
    await (await choruses()).countDocuments({ _id: own.slice(3) }),
    0,
  );
  assert.equal(
    await (await posts()).countDocuments({ chorusId: own.slice(3) }),
    0,
  );
  // Maya's Chorus stays, without Dana's post in it.
  assert.equal(
    await (await choruses()).countDocuments({ _id: other.slice(3) }),
    1,
  );
  assert.equal(
    await (await posts()).countDocuments({ chorusId: other.slice(3) }),
    0,
  );
});

test("the daily cleanup drops old tokens and drafts, and keeps the wall", async (t) => {
  const base = await listen(t);
  const ravi = await mockSession(base, "mock_ravi");
  const old = await startChorus(base, ravi, addDays(1));
  await join(base, old, ravi, "ch_ravi_x");
  const sam = await mockSession(base, "mock_sam");
  await join(base, old, sam, "ch_sam_li");
  const soon = await startChorus(base, sam, addDays(5));
  await join(base, soon, sam, "ch_sam_li");
  await mockSession(base, "mock_dana"); // signed in again after deleting, in no Chorus

  // The old Chorus was three days ago, and everyone signed in two days ago.
  await (await choruses()).updateOne(
    { _id: old.slice(3) },
    { $set: { day: addDays(-3) } },
  );
  await (await posts()).updateOne(
    { chorusId: old.slice(3), channelId: "ch_ravi_x" },
    { $set: { status: "sent", externalLink: "https://x.com/ravi/1" } },
  );
  await (await users()).updateMany(
    {},
    { $set: { signedInAt: new Date(Date.now() - 2 * 86_400_000) } },
  );
  const aiko = await mockSession(base, "mock_aiko"); // signed in just now
  assert.ok(aiko);

  const removed = await dailyCleanup();
  assert.deepEqual(removed, { tokens: 2, texts: 2 });
  assert.equal((await userOf("mock_ravi"))?.tokenEnc, undefined);
  assert.equal((await userOf("mock_dana"))?.tokenEnc, undefined);
  assert.ok((await userOf("mock_sam"))?.tokenEnc); // has a Chorus coming up
  assert.ok((await userOf("mock_aiko"))?.tokenEnc); // signed in today
  const wall = await (await posts()).find({ chorusId: old.slice(3) }).toArray();
  assert.ok(wall.every((p) => p.text === undefined));
  assert.equal(
    wall.find((p) => p.channelId === "ch_ravi_x")?.externalLink,
    "https://x.com/ravi/1",
  );
  const soonPost = await (await posts()).findOne({ chorusId: soon.slice(3) });
  assert.ok(soonPost?.text);
});

test("the cleanup endpoint needs the cron secret", async (t) => {
  const base = await listen(t);
  delete process.env.CRON_SECRET;
  assert.equal((await fetch(`${base}/api/cleanup`)).status, 401);
  process.env.CRON_SECRET = "c".repeat(32);
  const wrong = await fetch(`${base}/api/cleanup`, {
    headers: { authorization: "Bearer nope" },
  });
  assert.equal(wrong.status, 401);
  const right = await fetch(`${base}/api/cleanup`, {
    headers: { authorization: `Bearer ${"c".repeat(32)}` },
  });
  assert.equal(right.status, 200);
  assert.deepEqual(Object.keys(await right.json()), ["tokens", "texts"]);
});
