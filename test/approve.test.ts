import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "../src/choruses.ts";
import { scheduled } from "../src/mock.ts";
import { posts } from "../src/posts.ts";
import { localTime } from "../src/time.ts";
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

// Zsófia's Chorus, and a person who joined it and saved a draft. Returns the path and their cookie.
async function drafted(
  base: string,
  person: string,
  channelId: string,
  text: string,
) {
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
  const path = created.headers.get("location") ?? "";
  const cookie = await mockSession(base, person);
  await post(base, `${path}/join`, cookie, [["channelId", channelId]]);
  await post(base, `${path}/post`, cookie, [["text", text]]);
  return { path, cookie };
}

async function postOf(path: string, channelId: string) {
  return (await posts()).findOne({ chorusId: path.slice(3), channelId });
}

test("approving schedules the post in Buffer at 09:00 in the person's zone", async (t) => {
  const base = await listen(t);
  const { path, cookie } = await drafted(
    base,
    "mock_ravi",
    "ch_ravi_x",
    "Tally 2.0 is out today. #TallyLaunch",
  );
  const review = await post(base, `${path}/post`, cookie, [
    ["text", "Tally 2.0 is out today. #TallyLaunch"],
    ["action", "approve"],
  ]);
  assert.equal(review.headers.get("location"), `${path}/post/review`);
  const check = await (
    await fetch(`${base}${path}/post/review`, { headers: { cookie } })
  ).text();
  assert.match(
    check,
    /between <strong>09:00<\/strong> and <strong>09:12<\/strong> in your time zone/,
  );

  const approved = await post(base, `${path}/post/approve`, cookie);
  assert.equal(approved.headers.get("location"), path);
  const saved = await postOf(path, "ch_ravi_x");
  assert.equal(saved?.status, "scheduled");
  assert.ok(saved?.bufferPostId && scheduled.has(saved.bufferPostId));
  const at = localTime(saved.dueAt ?? new Date(0), "Asia/Kolkata");
  assert.ok(at >= "09:00" && at <= "09:12", at);

  const page = await (
    await fetch(`${base}${path}`, { headers: { cookie } })
  ).text();
  assert.match(page, /Scheduled/);
  assert.match(page, /Withdraw to change it/);
});

test("a double click makes one Buffer post", async (t) => {
  const base = await listen(t);
  const { path, cookie } = await drafted(
    base,
    "mock_aiko",
    "ch_aiko_li",
    "Out today! #TallyLaunch",
  );
  const before = scheduled.size;
  await Promise.all([
    post(base, `${path}/post/approve`, cookie),
    post(base, `${path}/post/approve`, cookie),
    post(base, `${path}/post/approve`, cookie),
  ]);
  assert.equal(scheduled.size, before + 1);
});

test("a post that is too long can't be approved", async (t) => {
  const base = await listen(t);
  const { path, cookie } = await drafted(
    base,
    "mock_ravi",
    "ch_ravi_x",
    `${"long ".repeat(70)}#TallyLaunch`,
  );
  const res = await post(base, `${path}/post/approve`, cookie);
  assert.equal(res.headers.get("location"), `${path}/post/review`);
  assert.equal((await postOf(path, "ch_ravi_x"))?.status, "drafting");
});

test("when Buffer refuses, the post is a draft again with Buffer's reason", async (t) => {
  const base = await listen(t);
  const { path, cookie } = await drafted(
    base,
    "mock_sam",
    "ch_sam_li",
    "Out today. #TallyLaunch",
  );
  // A channel the mock doesn't know, like one removed from Buffer after joining.
  await (await posts()).updateOne(
    { chorusId: path.slice(3) },
    { $set: { channelId: "ch_gone" } },
  );
  const res = await post(base, `${path}/post/approve`, cookie);
  assert.equal(res.headers.get("location"), `${path}/post`);
  const editor = await (
    await fetch(`${base}${path}/post`, { headers: { cookie } })
  ).text();
  assert.match(editor, /Buffer didn't schedule it: Channel not found/);
});

test("withdrawing takes it out of Buffer and keeps the text, but not at the last minute", async (t) => {
  const base = await listen(t);
  const { path, cookie } = await drafted(
    base,
    "mock_dana",
    "ch_dana_li",
    "Out today. #TallyLaunch",
  );
  await post(base, `${path}/post/approve`, cookie);
  const id = (await postOf(path, "ch_dana_li"))?.bufferPostId ?? "";

  const res = await post(base, `${path}/post/withdraw`, cookie);
  assert.equal(res.headers.get("location"), `${path}/post`);
  const draft = await postOf(path, "ch_dana_li");
  assert.equal(draft?.status, "drafting");
  assert.equal(draft?.text, "Out today. #TallyLaunch");
  assert.ok(!scheduled.has(id));

  await post(base, `${path}/post/approve`, cookie);
  await (await posts()).updateOne(
    { chorusId: path.slice(3), channelId: "ch_dana_li" },
    { $set: { dueAt: new Date(Date.now() + 2 * 60_000) } },
  );
  await post(base, `${path}/post/withdraw`, cookie);
  assert.equal((await postOf(path, "ch_dana_li"))?.status, "scheduled");
});

test("a scheduled post can't be edited or moved to another channel", async (t) => {
  const base = await listen(t);
  const { path, cookie } = await drafted(
    base,
    "mock_zsofia",
    "ch_zsofia_li",
    "Out today. #TallyLaunch",
  );
  await post(base, `${path}/post/approve`, cookie);
  const editor = await fetch(`${base}${path}/post`, {
    headers: { cookie },
    redirect: "manual",
  });
  assert.equal(editor.headers.get("location"), path);
  await post(base, `${path}/join`, cookie, [["channelId", "ch_zsofia_bsky"]]);
  assert.equal((await postOf(path, "ch_zsofia_li"))?.status, "scheduled");
});
