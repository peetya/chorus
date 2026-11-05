import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import sharp from "sharp";
import { addDays } from "../src/choruses.ts";
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

const get = async (base: string, path: string, cookie = "") =>
  (await fetch(`${base}${path}`, { headers: { cookie } })).text();

const meta = (page: string, name: string) =>
  new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`).exec(
    page,
  )?.[1];

test("every page has a title, a description and a card for shared links", async (t) => {
  const base = await listen(t);
  const landing = await get(base, "/");
  assert.match(
    landing,
    /<title>Chorus: announce it together, each in your own words<\/title>/,
  );
  assert.match(meta(landing, "description") ?? "", /Announce news together/);
  assert.equal(meta(landing, "og:image"), "/share.png");
  assert.equal(meta(landing, "twitter:card"), "summary_large_image");
  assert.equal(meta(landing, "robots"), undefined);

  const privacy = await get(base, "/privacy");
  assert.match(privacy, /<title>Privacy · Chorus<\/title>/);
  assert.match(meta(privacy, "description") ?? "", /What Chorus keeps/);
  assert.equal(meta(privacy, "robots"), undefined);

  // A person's own pages stay out of search results.
  const me = await get(base, "/me", await mockSession(base, "mock_sam"));
  assert.match(me, /<title>My Choruses · Chorus<\/title>/);
  assert.equal(meta(me, "robots"), "noindex");
});

test("a shared invite says what the Chorus is about, and stays out of search results", async (t) => {
  const base = await listen(t);
  await finishOpenChoruses();
  const owner = await mockSession(base, "mock_zsofia");
  const created = await fetch(`${base}/new`, {
    method: "POST",
    headers: { cookie: owner },
    body: new URLSearchParams([
      ["title", "Northwind ships Tally 2.0"],
      ["facts", "Tally 2.0 is out today."],
      ["hashtags", "#TallyLaunch"],
      ["questions", "What do you like most?"],
      ["day", addDays(14)],
      ["localTime", "09:00"],
    ]),
    redirect: "manual",
  });
  const invite = await get(base, created.headers.get("location") ?? "");
  assert.match(invite, /<title>Northwind ships Tally 2\.0 · Chorus<\/title>/);
  assert.equal(meta(invite, "og:title"), "Northwind ships Tally 2.0 · Chorus");
  assert.match(
    meta(invite, "og:description") ?? "",
    /^Zsófia K\. invites you to post about it together on .+, each in your own words, at 09:00 in your own time zone\.$/,
  );
  assert.equal(meta(invite, "robots"), "noindex");
});

test("on Vercel the card's image has its full address, and the image is the right size", async (t) => {
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "startchorus.com";
  t.after(() => delete process.env.VERCEL_PROJECT_PRODUCTION_URL);
  const base = await listen(t);
  assert.equal(
    meta(await get(base, "/privacy"), "og:image"),
    "https://startchorus.com/share.png",
  );
  assert.ok(existsSync("public/share.png"));
  const { width, height } = await sharp("public/share.png").metadata();
  assert.equal(`${width}x${height}`, "1200x630");
});
