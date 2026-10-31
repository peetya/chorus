import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_USES } from "../src/ai.ts";
import { addDays } from "../src/choruses.ts";
import { posts } from "../src/posts.ts";
import { listen, mockSession, useTestDb } from "./server.ts";

process.env.BUFFER_MOCK = "1";
process.env.SESSION_SECRET = "a".repeat(32);
process.env.TOKEN_KEY = "b".repeat(32);
delete process.env.OPENAI_API_KEY; // the fake AI, never a real call
useTestDb();

function post(base: string, path: string, cookie: string, fields: string[][]) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { cookie },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });
}

async function joined(base: string, person: string, channelId: string) {
  const owner = await mockSession(base, "mock_zsofia");
  const created = await post(base, "/new", owner, [
    ["title", "Northwind ships Tally 2.0"],
    ["facts", "Tally 2.0 is out today."],
    ["hashtags", "#TallyLaunch"],
    ["questions", "What do you like most?"],
    ["questions", "Where do you use it?"],
    ["day", addDays(14)],
    ["localTime", "09:00"],
  ]);
  const path = created.headers.get("location") ?? "";
  const cookie = await mockSession(base, person);
  await post(base, `${path}/join`, cookie, [["channelId", channelId]]);
  return { path, cookie };
}

async function postOf(path: string, channelId: string) {
  return (await posts()).findOne({ chorusId: path.slice(3), channelId });
}

test("draft with AI asks back when the answers are thin, then writes from them", async (t) => {
  const base = await listen(t);
  const { path, cookie } = await joined(base, "mock_sam", "ch_sam_li");
  const editor = await (
    await fetch(`${base}${path}/post`, { headers: { cookie } })
  ).text();
  assert.match(editor, /href="\/c\/[\w-]+\/post\/ai"[^>]*>Draft with AI</);
  const form = await (
    await fetch(`${base}${path}/post/ai`, { headers: { cookie } })
  ).text();
  assert.match(form, /What do you like most\?/);
  assert.match(form, /Where do you use it\?/);

  const thin = await post(base, `${path}/post/ai`, cookie, [
    ["answer", "speed"],
    ["answer", ""],
  ]);
  const asked = await thin.text();
  assert.match(asked, /What was the moment you knew it worked for you\?/);
  assert.match(asked, /name="followUp"/);
  assert.equal((await postOf(path, "ch_sam_li"))?.aiUses, 1);

  const res = await post(base, `${path}/post/ai`, cookie, [
    ["answer", "speed"],
    ["answer", ""],
    ["followUp", "What was the moment you knew it worked for you?"],
    ["followUpAnswer", "Closing the month in Lisbon in one afternoon."],
  ]);
  assert.equal(res.headers.get("location"), `${path}/post?drafted=1`);
  const saved = await postOf(path, "ch_sam_li");
  assert.equal(saved?.aiShaped, true);
  assert.equal(saved?.aiUses, 2);
  assert.match(saved?.text ?? "", /Lisbon in one afternoon\.\n\n#TallyLaunch$/);
  assert.equal(saved?.answers?.length, 3);

  const page = await (
    await fetch(`${base}${path}/post?drafted=1`, { headers: { cookie } })
  ).text();
  assert.match(page, /a draft from your answers/);
  // A name the person gave in their answers isn't flagged as missing from the fact card.
  assert.doesNotMatch(page, /Not on the fact card[^<]*Lisbon/);
});

test("draft with AI stops after the last try, and AI_DRAFTS=off hides it", async (t) => {
  const base = await listen(t);
  const { path, cookie } = await joined(base, "mock_aiko", "ch_aiko_li");
  await (await posts()).updateOne(
    { chorusId: path.slice(3) },
    { $set: { aiUses: AI_USES } },
  );
  const res = await post(base, `${path}/post/ai`, cookie, [
    ["answer", "The new reports save me an hour every Friday."],
  ]);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /used all your AI tries/);
  const editor = await (
    await fetch(`${base}${path}/post`, { headers: { cookie } })
  ).text();
  assert.match(editor, /No AI drafts left/);

  process.env.AI_DRAFTS = "off";
  t.after(() => delete process.env.AI_DRAFTS);
  const off = await (
    await fetch(`${base}${path}/post`, { headers: { cookie } })
  ).text();
  assert.doesNotMatch(off, /Draft with AI|No AI drafts left/);
  const form = await fetch(`${base}${path}/post/ai`, {
    headers: { cookie },
    redirect: "manual",
  });
  assert.equal(form.headers.get("location"), `${path}/post`);
});
