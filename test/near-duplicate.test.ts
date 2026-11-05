import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "../src/choruses.ts";
import { posts } from "../src/posts.ts";
import {
  finishOpenChoruses,
  listen,
  mockSession,
  useTestDb,
} from "./server.ts";

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

async function startChorus(base: string) {
  const owner = await mockSession(base, "mock_zsofia");
  await finishOpenChoruses();
  const created = await post(base, "/new", owner, [
    ["title", "Northwind ships Tally 2.0"],
    ["facts", "Tally 2.0 is out today."],
    ["hashtags", "#TallyLaunch"],
    ["questions", "What do you like most?"],
    ["day", addDays(14)],
    ["localTime", "09:00"],
  ]);
  return created.headers.get("location") ?? "";
}

async function drafted(
  base: string,
  path: string,
  person: string,
  channelId: string,
  text: string,
) {
  const cookie = await mockSession(base, person);
  await post(base, `${path}/join`, cookie, [["channelId", channelId]]);
  await post(base, `${path}/post`, cookie, [["text", text]]);
  return cookie;
}

async function statusOf(path: string, channelId: string) {
  return (await posts()).findOne({ chorusId: path.slice(3), channelId });
}

test("a post close to one already approved can't be scheduled", async (t) => {
  const base = await listen(t);
  const path = await startChorus(base);
  const maya = await drafted(
    base,
    path,
    "mock_maya",
    "ch_maya_bsky",
    "Tally 2.0 is out today. Our team loves the Slack sync. #TallyLaunch",
  );
  await post(base, `${path}/post/approve`, maya);
  const sam = await drafted(
    base,
    path,
    "mock_sam",
    "ch_sam_li",
    "Tally 2.0 is out today! Our team loves the Slack sync #TallyLaunch",
  );

  const review = await (
    await fetch(`${base}${path}/post/review`, { headers: { cookie: sam } })
  ).text();
  assert.match(review, /very close to Maya L\.&#39;s/);
  assert.doesNotMatch(review, /Schedule it in Buffer/);
  await post(base, `${path}/post/approve`, sam);
  assert.equal((await statusOf(path, "ch_sam_li"))?.status, "drafting");

  // In his own words it goes through.
  await post(base, `${path}/post`, sam, [
    [
      "text",
      "We moved our London team to Tally last month. 2.0 is out today. #TallyLaunch",
    ],
  ]);
  await post(base, `${path}/post/approve`, sam);
  assert.equal((await statusOf(path, "ch_sam_li"))?.status, "scheduled");
});

test("the confirmed time zone is the one the post is scheduled in", async (t) => {
  const base = await listen(t);
  const path = await startChorus(base);
  const sam = await drafted(
    base,
    path,
    "mock_sam",
    "ch_sam_li",
    "Tally 2.0 is out today. #TallyLaunch",
  );
  // Sam's channel says London, which is also Buffer's default, so the page asks.
  const review = await (
    await fetch(`${base}${path}/post/review`, { headers: { cookie: sam } })
  ).text();
  assert.match(review, /<select id="tz" name="tz" data-tz-guess>/);
  assert.match(review, /<option value="Europe\/London" selected>/);
  assert.match(review, /Buffer says London/);

  const bad = await post(base, `${path}/post/approve`, sam, [
    ["tz", "Mars/Olympus"],
  ]);
  assert.equal(bad.headers.get("location"), `${path}/post/review`);
  assert.equal((await statusOf(path, "ch_sam_li"))?.status, "drafting");

  await post(base, `${path}/post/approve`, sam, [["tz", "Asia/Tokyo"]]);
  const saved = await statusOf(path, "ch_sam_li");
  assert.equal(saved?.channelTz, "Asia/Tokyo");
  assert.equal(saved?.tzConfirmed, true);
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
  }).format(saved?.dueAt);
  assert.equal(hour, "09");
});
