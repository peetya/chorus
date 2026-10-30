import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "../src/choruses.ts";
import { posts } from "../src/posts.ts";
import { utcOffset, zonedToUtc } from "../src/time.ts";
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

async function join(
  base: string,
  path: string,
  person: string,
  channelId: string,
  text?: string,
) {
  const cookie = await mockSession(base, person);
  await post(base, `${path}/join`, cookie, [["channelId", channelId]]);
  if (text) await post(base, `${path}/post`, cookie, [["text", text]]);
  return cookie;
}

test("the offset is the one on the Chorus day", () => {
  const nov11 = zonedToUtc("2026-11-11", "09:00", "America/New_York");
  assert.equal(utcOffset(nov11, "America/New_York"), "UTC-5");
  assert.equal(utcOffset(nov11, "Asia/Kolkata"), "UTC+5:30");
  assert.equal(utcOffset(nov11, "Europe/London"), "UTC+0");
});

test("the organizer sees who is ready, and nobody's text", async (t) => {
  const base = await listen(t);
  const owner = await mockSession(base, "mock_zsofia");
  const created = await post(base, "/new", owner, [
    ["title", "Northwind ships Tally 2.0"],
    ["facts", "Tally 2.0 is out today."],
    ["hashtags", "#TallyLaunch"],
    ["questions", "What do you like most?"],
    ["day", addDays(14)],
    ["localTime", "09:00"],
  ]);
  const path = created.headers.get("location") ?? "";

  const dana = await join(
    base,
    path,
    "mock_dana",
    "ch_dana_li",
    "Secret draft from Dana. #TallyLaunch",
  );
  await post(base, `${path}/post/approve`, dana);
  await join(base, path, "mock_ravi", "ch_ravi_x", "Ravi is still writing");
  await join(base, path, "mock_sam", "ch_sam_li");
  await join(base, path, "mock_aiko", "ch_aiko_li", "Aiko's try");
  await (await posts()).updateOne(
    { chorusId: path.slice(3), channelId: "ch_aiko_li" },
    { $set: { lastError: "Channel not found" } },
  );

  const html = await (
    await fetch(`${base}${path}`, { headers: { cookie: owner } })
  ).text();
  assert.match(html, /<strong>1<\/strong> ready and scheduled/);
  assert.match(html, /<strong>2<\/strong> still writing/);
  assert.match(html, /<strong>1<\/strong> needs a look/);
  assert.match(html, /Dana R\.<\/td>/);
  assert.match(html, /New York <span[^>]*>UTC-5<\/span>/);
  assert.match(html, /<span class="mono">09:(0\d|1[0-2])<\/span>/);
  assert.match(html, /Buffer refused it: Channel not found/);
  assert.match(html, /class="status drafting">Not started/);
  assert.match(html, /3 people aren&#39;t ready yet/);
  assert.match(html, /nudge to Ravi K\., Sam W\., and Aiko T\., where/);
  assert.doesNotMatch(html, /Secret draft|Ravi is still writing|Aiko's try/);
  assert.doesNotMatch(html, /Dana Rossi/);

  // Everyone else still gets the invite.
  const invite = await (
    await fetch(`${base}${path}`, { headers: { cookie: dana } })
  ).text();
  assert.doesNotMatch(invite, /ready and scheduled|Invite link/);
});
