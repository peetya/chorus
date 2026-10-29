import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "../src/choruses.ts";
import { findPost } from "../src/posts.ts";
import { users } from "../src/users.ts";
import { listen, mockSession, useTestDb } from "./server.ts";

process.env.BUFFER_MOCK = "1";
process.env.SESSION_SECRET = "a".repeat(32);
process.env.TOKEN_KEY = "b".repeat(32);
useTestDb();

function post(base: string, path: string, cookie: string, fields: string[][]) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { cookie },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });
}

// Zsófia starts a Chorus and Ravi joins it with his X channel. Returns the Chorus path and Ravi's cookie.
async function joined(base: string) {
  const owner = await mockSession(base, "mock_zsofia");
  const created = await post(base, "/new", owner, [
    ["title", "Northwind ships Tally 2.0"],
    ["facts", "Tally 2.0 is out today."],
    ["hashtags", "#TallyLaunch"],
    ["questions", "What do you like most?"],
    ["day", addDays(14)],
    ["localTime", "09:00"],
    ["tone", "casual"],
  ]);
  const path = created.headers.get("location") ?? "";
  const cookie = await mockSession(base, "mock_ravi");
  await post(base, `${path}/join`, cookie, [["channelId", "ch_ravi_x"]]);
  return { path, cookie };
}

test("the editor starts with the main hashtag and shows the brief", async (t) => {
  const base = await listen(t);
  const { path, cookie } = await joined(base);
  const html = await (
    await fetch(`${base}${path}/post`, { headers: { cookie } })
  ).text();
  assert.match(html, /<textarea[^>]*>\n\n#TallyLaunch<\/textarea>/);
  assert.match(html, /Zsófia K\. suggests: <strong>casual<\/strong>/);
  assert.match(html, /\/ 280/); // X's limit, from the channel
});

test("writing needs joining first", async (t) => {
  const base = await listen(t);
  const { path } = await joined(base);
  const other = await mockSession(base, "mock_sam");
  const res = await fetch(`${base}${path}/post`, {
    headers: { cookie: other },
    redirect: "manual",
  });
  assert.equal(res.headers.get("location"), `${path}/join`);
  const check = await fetch(`${base}${path}/post/check`, {
    method: "POST",
    headers: { cookie: other, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "hi" }),
  });
  assert.equal(check.status, 403);
});

test("the check endpoint answers with the checks for the text", async (t) => {
  const base = await listen(t);
  const { path, cookie } = await joined(base);
  const res = await fetch(`${base}${path}/post/check`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ text: `${"x".repeat(300)} <b>` }),
  });
  const html = await res.text();
  assert.match(html, /class="check block"/);
  assert.match(html, /Add #TallyLaunch/);
  assert.doesNotMatch(html, /<b>/);
});

test("a saved draft comes back, even when it's too long", async (t) => {
  const base = await listen(t);
  const { path, cookie } = await joined(base);
  const text = `${"Long ".repeat(80)}#TallyLaunch`;
  const saved = await post(base, `${path}/post`, cookie, [["text", text]]);
  assert.equal(saved.headers.get("location"), `${path}/post?saved=1`);

  const page = await (
    await fetch(`${base}${path}/post?saved=1`, { headers: { cookie } })
  ).text();
  assert.match(page, /Saved\./);
  assert.match(page, /Too long by/);
  const ravi = await (await users()).findOne({
    providerAccountId: "mock_ravi",
  });
  const stored = await findPost(path.slice(3), ravi?._id ?? "");
  assert.equal(stored?.text, text);
});

test("after sign-in, the editor is a place you can come back to", async (t) => {
  const base = await listen(t);
  const { path } = await joined(base);
  const res = await fetch(`${base}${path}/post`, { redirect: "manual" });
  assert.equal(res.headers.get("location"), `/login?next=${path}/post`);
});
