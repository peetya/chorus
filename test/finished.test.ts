import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, choruses } from "../src/choruses.ts";
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

const at = (iso: string) => new Date(iso);

test("after the day the wall is a public record with links to the real posts", async (t) => {
  const base = await listen(t);
  const owner = await mockSession(base, "mock_zsofia");
  await finishOpenChoruses();
  const created = await post(base, "/new", owner, [
    ["title", "Northwind ships Tally 2.0"],
    ["facts", "Tally 2.0 is out today."],
    ["hashtags", "#TallyLaunch"],
    ["questions", "What do you like most?"],
    ["day", addDays(7)],
    ["localTime", "09:00"],
  ]);
  const path = created.headers.get("location") ?? "";
  const chorusId = path.slice(3);
  const people: [string, string, string][] = [
    ["mock_aiko", "ch_aiko_li", "Aiko's own words. #TallyLaunch"],
    ["mock_dana", "ch_dana_li", "Dana writing from New York. #TallyLaunch"],
    [
      "mock_maya",
      "ch_maya_bsky",
      "Maya on Bluesky, short and sweet. #TallyLaunch",
    ],
    ["mock_ravi", "ch_ravi_x", "Ravi never got to approve this one."],
  ];
  for (const [person, channelId, text] of people) {
    const cookie = await mockSession(base, person);
    await post(base, `${path}/join`, cookie, [["channelId", channelId]]);
    await post(base, `${path}/post`, cookie, [["text", text]]);
  }

  // The wave happened three days ago: Tokyo first, San Francisco last, Dana's post failed.
  const day = addDays(-3);
  await (await choruses()).updateOne({ _id: chorusId }, { $set: { day } });
  const set = async (channelId: string, fields: object) =>
    (await posts()).updateOne({ chorusId, channelId }, { $set: fields });
  await set("ch_aiko_li", {
    status: "sent",
    dueAt: at(`${day}T00:04:00Z`),
    externalLink: "https://www.linkedin.com/feed/update/aiko",
  });
  await set("ch_dana_li", {
    status: "failed",
    dueAt: at(`${day}T14:07:00Z`),
    lastError: "Token expired",
  });
  await set("ch_maya_bsky", {
    status: "sent",
    dueAt: at(`${day}T17:11:00Z`),
    externalLink: "javascript:alert(1)",
  });

  const html = await (await fetch(`${base}${path}`)).text();
  assert.match(html, /Done · /);
  assert.match(
    html,
    /<p class="finished-title">Northwind ships Tally 2.0<\/p>/,
  );
  assert.match(html, /2 of 3 posts went out\./);
  assert.match(html, /2 people · 2 networks · 2 time zones/);
  assert.match(
    html,
    /Tokyo 00:04 UTC to Los Angeles 17:11 UTC\. 17 h 7 min, following the morning\./,
  );
  assert.match(
    html,
    /<a href="https:\/\/www.linkedin.com\/feed\/update\/aiko" rel="noopener" class="finished-post" aria-label="Open Aiko T.'s post on LinkedIn">/,
  );
  // Only plain web links from Buffer become links.
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /Maya L\./);
  assert.doesNotMatch(html, /Dana R\.|Token expired|Ravi K\.|own words/);
  assert.match(html, /Start your own Chorus/);

  const dashboard = await (
    await fetch(`${base}${path}?dashboard`, { headers: { cookie: owner } })
  ).text();
  assert.match(dashboard, /See the finished wall/);
});
