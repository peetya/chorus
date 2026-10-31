import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "../src/choruses.ts";
import { scheduled } from "../src/mock.ts";
import { DRAFT_CHECKS, posts } from "../src/posts.ts";
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

async function startChorus(base: string) {
  const owner = await mockSession(base, "mock_zsofia");
  const res = await post(base, "/new", owner, [
    ["title", "Northwind ships Tally 2.0"],
    ["facts", "Tally 2.0 is out today."],
    ["hashtags", "#TallyLaunch"],
    ["questions", "What do you like most?"],
    ["day", addDays(14)],
    ["localTime", "09:00"],
  ]);
  return res.headers.get("location") ?? "";
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
  await post(base, `${path}/post/approve`, cookie, [["as", "draft"]]);
  return cookie;
}

async function postOf(path: string, channelId: string) {
  return (await posts()).findOne({ chorusId: path.slice(3), channelId });
}

async function checkDueNow(path: string, channelId: string, fields = {}) {
  await (await posts()).updateOne(
    { chorusId: path.slice(3), channelId },
    { $set: { nextCheckAt: new Date(Date.now() - 1000), ...fields } },
  );
}

const minutesFromNow = (date?: Date) =>
  Math.round(((date?.getTime() ?? 0) - Date.now()) / 60_000);

test("a post saved to Buffer drafts is followed, at most once an hour", async (t) => {
  const base = await listen(t);
  const path = await startChorus(base);
  const sam = await mockSession(base, "mock_sam");
  await post(base, `${path}/join`, sam, [["channelId", "ch_sam_li"]]);
  await post(base, `${path}/post`, sam, [
    ["text", "Sam's own words. #TallyLaunch"],
  ]);
  const review = await (
    await fetch(`${base}${path}/post/review`, { headers: { cookie: sam } })
  ).text();
  assert.match(review, /name="as" value="draft"/);

  await post(base, `${path}/post/approve`, sam, [["as", "draft"]]);
  const saved = await postOf(path, "ch_sam_li");
  assert.equal(saved?.status, "drafted");
  assert.equal(scheduled.get(saved?.bufferPostId ?? "")?.draft, true);
  assert.equal(minutesFromNow(saved?.nextCheckAt), 60);
  const page = await (
    await fetch(`${base}${path}`, { headers: { cookie: sam } })
  ).text();
  assert.match(page, /In your Buffer drafts/);

  // Still a draft in Buffer: one check used, the next in an hour.
  await checkDueNow(path, "ch_sam_li");
  await fetch(`${base}${path}`);
  const still = await postOf(path, "ch_sam_li");
  assert.equal(still?.status, "drafted");
  assert.equal(still?.statusChecks, 1);
  assert.equal(minutesFromNow(still?.nextCheckAt), 60);

  // After the last allowed check it stops asking.
  await checkDueNow(path, "ch_sam_li", { statusChecks: DRAFT_CHECKS - 1 });
  await fetch(`${base}${path}`);
  const last = await postOf(path, "ch_sam_li");
  assert.equal(last?.statusChecks, DRAFT_CHECKS);
  assert.equal(last?.nextCheckAt, undefined);
});

test("a draft scheduled from Buffer becomes a scheduled post at Buffer's time", async (t) => {
  const base = await listen(t);
  const path = await startChorus(base);
  await drafted(
    base,
    path,
    "mock_dana",
    "ch_dana_li",
    "Dana's draft. #TallyLaunch",
  );
  const saved = await postOf(path, "ch_dana_li");
  const inBuffer = scheduled.get(saved?.bufferPostId ?? "");
  assert.ok(inBuffer);
  // Dana opens Buffer and schedules it for later than 09:00.
  const later = new Date(Date.now() + 15 * 86_400_000);
  inBuffer.draft = false;
  inBuffer.dueAt = later.toISOString();

  await checkDueNow(path, "ch_dana_li");
  await fetch(`${base}${path}`);
  const after = await postOf(path, "ch_dana_li");
  assert.equal(after?.status, "scheduled");
  assert.equal(after?.dueAt?.toISOString(), later.toISOString());
  assert.equal(after?.statusChecks, 0);
  assert.equal(
    after?.nextCheckAt?.toISOString(),
    new Date(later.getTime() + 2 * 60_000).toISOString(),
  );
});

test("a draft deleted in Buffer comes back to the editor", async (t) => {
  const base = await listen(t);
  const path = await startChorus(base);
  const text = "Ravi's draft, deleted in Buffer. #TallyLaunch";
  const ravi = await drafted(base, path, "mock_ravi", "ch_ravi_x", text);
  const saved = await postOf(path, "ch_ravi_x");
  scheduled.delete(saved?.bufferPostId ?? "");

  await checkDueNow(path, "ch_ravi_x");
  await fetch(`${base}${path}`);
  const after = await postOf(path, "ch_ravi_x");
  assert.equal(after?.status, "drafting");
  assert.equal(after?.text, text);
  assert.equal(after?.bufferPostId, undefined);
  assert.equal(after?.nextCheckAt, undefined);
  const page = await (
    await fetch(`${base}${path}`, { headers: { cookie: ravi } })
  ).text();
  assert.match(page, /Edit your post/);
});

test("a draft can be taken back any time, and counts for near-duplicates", async (t) => {
  const base = await listen(t);
  const path = await startChorus(base);
  const text = "Tally 2.0 is out today and our team loves it. #TallyLaunch";
  const aiko = await drafted(base, path, "mock_aiko", "ch_aiko_li", text);

  // Ravi can't approve the same words while Aiko's draft may still go out.
  const ravi = await drafted(base, path, "mock_ravi", "ch_ravi_x", text);
  assert.equal((await postOf(path, "ch_ravi_x"))?.status, "drafting");
  const editor = await (
    await fetch(`${base}${path}/post`, { headers: { cookie: ravi } })
  ).text();
  assert.match(editor, /very close to Aiko T\./);

  // If Buffer refuses to delete it, it stays a draft.
  const saved = await postOf(path, "ch_aiko_li");
  const id = saved?.bufferPostId ?? "";
  const copy = scheduled.get(id);
  scheduled.delete(id);
  await post(base, `${path}/post/withdraw`, aiko);
  assert.equal((await postOf(path, "ch_aiko_li"))?.status, "drafted");

  if (copy) scheduled.set(id, copy);
  const res = await post(base, `${path}/post/withdraw`, aiko);
  assert.equal(res.headers.get("location"), `${path}/post`);
  const back = await postOf(path, "ch_aiko_li");
  assert.equal(back?.status, "drafting");
  assert.equal(back?.text, text);
  assert.ok(!scheduled.has(id));
});
