import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPost, lengthFor, unknownClaims } from "../src/checks.ts";
import type { Chorus } from "../src/choruses.ts";

const chorus: Chorus = {
  _id: "abc",
  ownerId: "u1",
  kind: "wave",
  createdAt: new Date(),
  title: "Northwind ships Tally 2.0",
  facts: [
    "Tally 2.0 is out today, free for teams up to 5.",
    "It works with Buffer, Slack and Notion.",
  ],
  link: "https://tally.app/launch",
  hashtags: ["#TallyLaunch", "#buildinpublic"],
  maxHashtags: 2,
  avoid: ["prices for big teams"],
  questions: ["What do you like most?"],
  tone: "any",
  day: "2026-11-19",
  localTime: "09:00",
};

test("each network counts length its own way", () => {
  assert.equal(lengthFor("linkedin", "Hi 👋"), 5); // an emoji is 2 UTF-16 units
  assert.equal(
    lengthFor("linkedin", "See https://tally.app/launch now"),
    8 + 24,
  );
  assert.equal(
    lengthFor("twitter", "See https://tally.app/launch now"),
    8 + 23,
  );
  assert.equal(lengthFor("twitter", "👨‍👩‍👧"), 2); // a family emoji is one emoji on X
  assert.equal(lengthFor("twitter", "日本"), 4);
  assert.equal(lengthFor("bluesky", "👨‍👩‍👧"), 1); // graphemes
  assert.equal(
    lengthFor("bluesky", "https://tally.app/a/very/long/path/to/somewhere"),
    9 + 16,
  );
  assert.equal(lengthFor("instagram", "a\nb"), 4); // a line break is 2
  assert.equal(lengthFor("mastodon", "Hi @ana@mastodon.social"), 7);
});

test("numbers, names and links that aren't on the fact card are flagged", () => {
  const claims = unknownClaims(
    "We shipped Tally 2.0 today. It's free for up to 5 people, works with Slack, and 40% of Gartner's list use it. See tally.app and example.com. Thanks @ana!",
    chorus,
  );
  assert.deepEqual(claims, ["example.com", "@ana", "40%", "Gartner"]);
});

test("the first word of a sentence, I and the Chorus day are not claims", () => {
  assert.deepEqual(
    unknownClaims(
      "Today I posted. On Thursday 19 November at 09:00 we go live.",
      chorus,
    ),
    [],
  );
});

test("too long blocks, the rest only warns", () => {
  const result = checkPost("x".repeat(281), chorus, "twitter", "Zsófia K.");
  assert.equal(result.checks[0].level, "block");
  assert.ok(result.checks.slice(1).every((check) => check.level !== "block"));
});

test("hashtags, the avoid list and the main tag are checked", () => {
  const { checks } = checkPost(
    "Prices for big teams are coming. #a #b #c",
    chorus,
    "linkedin",
    "Zsófia K.",
  );
  const texts = checks.map((check) => check.text).join("\n");
  assert.match(texts, /Add #TallyLaunch/);
  assert.match(texts, /3 hashtags: Zsófia K\. asked for at most 2/);
  assert.match(texts, /Please avoid/);
});

test("a good post passes", () => {
  const { checks } = checkPost(
    "Tally 2.0 is out today, and it works with Notion. #TallyLaunch",
    chorus,
    "linkedin",
    "Zsófia K.",
  );
  assert.ok(
    checks.every((check) => check.level === "ok"),
    JSON.stringify(checks),
  );
});
