import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNext } from "../src/auth.ts";
import { addDays, type Chorus, choruses, getChorus } from "../src/choruses.ts";
import { postsOf } from "../src/posts.ts";
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

// Zsófia starts a Chorus and returns its page path, like "/c/AE1lcZZs".
async function startChorus(base: string, day = addDays(14)): Promise<string> {
  const cookie = await mockSession(base, "mock_zsofia");
  const res = await post(base, "/new", cookie, [
    ["title", "Northwind ships Tally 2.0"],
    ["note", "Let's tell it together."],
    ["facts", "Tally 2.0 is out today."],
    ["hashtags", "#TallyLaunch"],
    ["questions", "What do you like most?"],
    ["day", day],
    ["localTime", "09:00"],
  ]);
  return res.headers.get("location") ?? "";
}

test("only our own Chorus pages are allowed after sign-in", () => {
  assert.equal(safeNext("/c/AE1lcZZs/join"), "/c/AE1lcZZs/join");
  assert.equal(safeNext("https://evil.example"), "/me");
  assert.equal(safeNext("//evil.example/c/x"), "/me");
  assert.equal(safeNext(undefined), "/me");
});

test("anyone with the link sees the invite", async (t) => {
  const base = await listen(t);
  const path = await startChorus(base);
  const html = await (await fetch(`${base}${path}`)).text();
  assert.match(html, /Zsófia K\. invited you to/);
  assert.match(html, /Northwind ships Tally 2\.0/);
  assert.match(html, /Tally 2\.0 is out today\./);
  assert.match(html, /Join with Buffer/);
  assert.doesNotMatch(html, /Invite link/);
});

test("an unknown Chorus is a 404", async (t) => {
  const base = await listen(t);
  const res = await fetch(`${base}/c/nothing`);
  assert.equal(res.status, 404);
});

test("joining while signed out signs in first and comes back", async (t) => {
  const base = await listen(t);
  const path = await startChorus(base);
  const join = await fetch(`${base}${path}/join`, { redirect: "manual" });
  assert.equal(join.headers.get("location"), `/login?next=${path}/join`);

  const login = await post(base, "/login/mock", "", [
    ["person", "mock_aiko"],
    ["next", `${path}/join`],
  ]);
  assert.equal(login.headers.get("location"), `${path}/join`);
});

test("the channel list blocks channels Buffer can't post from", async (t) => {
  const base = await listen(t);
  const path = await startChorus(base);
  const cookie = await mockSession(base, "mock_ravi");
  const html = await (
    await fetch(`${base}${path}/join`, { headers: { cookie } })
  ).text();
  assert.match(html, /ravi_builds/);
  assert.match(html, /value="ch_ravi_bsky" disabled/);
  assert.match(html, /paused in Buffer/);

  const paused = await post(base, `${path}/join`, cookie, [
    ["channelId", "ch_ravi_bsky"],
  ]);
  assert.equal(paused.status, 400);
  const notMine = await post(base, `${path}/join`, cookie, [
    ["channelId", "ch_aiko_li"],
  ]);
  assert.equal(notMine.status, 400);
});

test("joining twice keeps one post and changes the channel", async (t) => {
  const base = await listen(t);
  const path = await startChorus(base);
  const cookie = await mockSession(base, "mock_dana");
  const first = await post(base, `${path}/join`, cookie, [
    ["channelId", "ch_dana_li"],
  ]);
  assert.equal(first.headers.get("location"), `${path}/post`);

  const page = await (
    await fetch(`${base}${path}`, { headers: { cookie } })
  ).text();
  assert.match(page, /You're in/);
  assert.match(page, /1 person is in/);

  await post(base, `${path}/join`, cookie, [["channelId", "ch_dana_li"]]);
  const all = await postsOf(path.slice(3));
  assert.equal(all.length, 1);
  assert.equal(all[0].channelService, "linkedin");
  assert.equal(all[0].channelTz, "America/New_York");
});

test("a joined Chorus shows up in My Choruses", async (t) => {
  const base = await listen(t);
  const path = await startChorus(base);
  const cookie = await mockSession(base, "mock_maya");
  await post(base, `${path}/join`, cookie, [["channelId", "ch_maya_bsky"]]);
  const html = await (
    await fetch(`${base}/me`, { headers: { cookie } })
  ).text();
  assert.match(html, /You joined · organized by Zsófia K\./);
  assert.match(html, new RegExp(`href="${path}"`));
});

test("the organizer sees the invite link", async (t) => {
  const base = await listen(t);
  const path = await startChorus(base);
  const cookie = await mockSession(base, "mock_zsofia");
  const html = await (
    await fetch(`${base}${path}`, { headers: { cookie } })
  ).text();
  assert.match(html, /Invite link/);
  assert.match(html, new RegExp(`value="https://localhost:\\d+${path}"`));
});

test("joining stays open the day after, then closes", async (t) => {
  const base = await listen(t);
  const cookie = await mockSession(base, "mock_sam");
  // Yesterday is still open: the last time zones are still on that day.
  const yesterday = await startChorus(base, addDays(-1));
  const open = await fetch(`${base}${yesterday}/join`, { headers: { cookie } });
  assert.equal(open.status, 200);

  // The form doesn't take older days, so this one goes straight into the database.
  const { _id, ...rest } = (await getChorus(yesterday.slice(3))) as Chorus;
  await (await choruses()).insertOne({
    ...rest,
    _id: "oldwave1",
    day: addDays(-3),
  });
  const closed = await fetch(`${base}/c/oldwave1/join`, {
    headers: { cookie },
    redirect: "manual",
  });
  assert.equal(closed.headers.get("location"), "/c/oldwave1");
  const html = await (
    await fetch(`${base}/c/oldwave1`, { headers: { cookie } })
  ).text();
  assert.match(html, /Joining is closed/);
});
