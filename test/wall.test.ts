import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "../src/choruses.ts";
import { scheduled } from "../src/mock.ts";
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

async function scheduleAs(
  base: string,
  path: string,
  person: string,
  channelId: string,
  text: string,
) {
  const cookie = await mockSession(base, person);
  await post(base, `${path}/join`, cookie, [["channelId", channelId]]);
  await post(base, `${path}/post`, cookie, [["text", text]]);
  await post(base, `${path}/post/approve`, cookie);
  return cookie;
}

// Moves a scheduled post's time into the past, in our database and in the mock's Buffer.
async function makeDue(path: string, channelId: string, mockSaysDue = true) {
  const filter = { chorusId: path.slice(3), channelId };
  const saved = await (await posts()).findOne(filter);
  const past = new Date(Date.now() - 3 * 60_000);
  await (await posts()).updateOne(filter, {
    $set: { dueAt: past, nextCheckAt: past },
  });
  const inBuffer = scheduled.get(saved?.bufferPostId ?? "");
  if (inBuffer && mockSaysDue) inBuffer.dueAt = past.toISOString();
}

async function postOf(path: string, channelId: string) {
  return (await posts()).findOne({ chorusId: path.slice(3), channelId });
}

test("on the day the wall shows who posted, with links to the real posts", async (t) => {
  const base = await listen(t);
  const owner = await mockSession(base, "mock_zsofia");
  await finishOpenChoruses();
  const created = await post(base, "/new", owner, [
    ["title", "Northwind ships Tally 2.0"],
    ["facts", "Tally 2.0 is out today."],
    ["hashtags", "#TallyLaunch"],
    ["questions", "What do you like most?"],
    ["day", addDays(0)],
    ["localTime", "09:00"],
  ]);
  const path = created.headers.get("location") ?? "";

  await scheduleAs(
    base,
    path,
    "mock_dana",
    "ch_dana_li",
    "Dana here. Tally 2.0 is out today. #TallyLaunch",
  );
  await scheduleAs(
    base,
    path,
    "mock_sam",
    "ch_sam_li",
    "Sam writing about the London office move. #TallyLaunch",
  );
  await scheduleAs(
    base,
    path,
    "mock_zsofia",
    "ch_zsofia_bsky",
    "Zsófia's own words on Bluesky. #TallyLaunch",
  );
  await scheduleAs(
    base,
    path,
    "mock_aiko",
    "ch_aiko_li",
    "Aiko from Tokyo, a little later. #TallyLaunch",
  );
  const ravi = await mockSession(base, "mock_ravi");
  await post(base, `${path}/join`, ravi, [["channelId", "ch_ravi_x"]]);

  await makeDue(path, "ch_dana_li");
  await makeDue(path, "ch_zsofia_bsky");
  // Buffer still says scheduled for Sam: the check is used up and the next one waits.
  await makeDue(path, "ch_sam_li", false);

  // Several viewers at once still ask Buffer once per post.
  const pages = await Promise.all(
    Array.from({ length: 5 }, () => fetch(`${base}${path}`)),
  );
  await Promise.all(pages.map((page) => page.text()));

  const dana = await postOf(path, "ch_dana_li");
  assert.equal(dana?.status, "sent");
  assert.equal(dana?.statusChecks, 1);
  assert.equal(dana?.nextCheckAt, undefined);
  const zsofia = await postOf(path, "ch_zsofia_bsky");
  assert.equal(zsofia?.status, "failed");
  assert.equal(zsofia?.lastError, "Bluesky didn't accept the post (mock)");
  const sam = await postOf(path, "ch_sam_li");
  assert.equal(sam?.status, "scheduled");
  assert.equal(sam?.statusChecks, 1);
  assert.ok(sam?.nextCheckAt && sam.nextCheckAt > new Date());

  const wall = await (await fetch(`${base}${path}`)).text();
  assert.match(wall, /Live now/);
  assert.match(wall, /<strong>1 of 4<\/strong> posts are out/);
  assert.match(wall, /1 person is still writing/);
  assert.match(wall, /href="https:\/\/example.com\/mock\/mockpost_\w+"/);
  assert.match(wall, /Didn't go out/);
  assert.match(wall, /Going out/);
  assert.match(
    wall,
    /<h2 class="zone-title">Tokyo <span[^>]*>UTC\+9<\/span><\/h2>/,
  );
  assert.match(wall, /There's still time to join/);
  assert.doesNotMatch(wall, /Dana here|Dana Rossi/);

  // The polled part, and the organizer's way back to the dashboard.
  const part = await (await fetch(`${base}${path}/wall`)).text();
  assert.match(part, /<strong>1 of 4<\/strong>/);
  const organizer = await (
    await fetch(`${base}${path}`, { headers: { cookie: owner } })
  ).text();
  assert.match(organizer, /Open your dashboard/);
  const dashboard = await (
    await fetch(`${base}${path}?dashboard`, { headers: { cookie: owner } })
  ).text();
  assert.match(dashboard, /ready and scheduled/);
  assert.match(dashboard, /See the live wall/);
  const mine = await (
    await fetch(`${base}/me`, { headers: { cookie: owner } })
  ).text();
  assert.match(mine, /<h2>Live now<\/h2>/);
});

test("a Chorus days away has no wall yet", async (t) => {
  const base = await listen(t);
  const owner = await mockSession(base, "mock_zsofia");
  await finishOpenChoruses();
  const created = await post(base, "/new", owner, [
    ["title", "Later"],
    ["facts", "Soon."],
    ["hashtags", "#Later"],
    ["questions", "Why?"],
    ["day", addDays(3)],
    ["localTime", "09:00"],
  ]);
  const page = await (
    await fetch(`${base}${created.headers.get("location")}`)
  ).text();
  assert.doesNotMatch(page, /Live now|data-wall/);
});
