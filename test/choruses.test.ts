import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, parseChorus } from "../src/choruses.ts";
import { listen, mockSession, useTestDb } from "./server.ts";

process.env.BUFFER_MOCK = "1";
process.env.SESSION_SECRET = "a".repeat(32);
process.env.TOKEN_KEY = "b".repeat(32);
useTestDb();

function form(overrides: Record<string, string | string[]> = {}) {
  return {
    title: "Northwind ships Tally 2.0",
    facts: ["Tally 2.0 is out today.", ""],
    hashtags: "#TallyLaunch buildinpublic",
    questions: ["What do you like most?"],
    day: addDays(14),
    localTime: "09:00",
    tone: "casual",
    ...overrides,
  };
}

function body(fields: Record<string, string | string[]>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of [value].flat()) params.append(key, item);
  }
  return params;
}

test("a filled-in form becomes a Chorus", () => {
  const { input, errors } = parseChorus(form());
  assert.deepEqual(errors, []);
  assert.deepEqual(input.facts, ["Tally 2.0 is out today."]);
  assert.deepEqual(input.hashtags, ["#TallyLaunch", "#buildinpublic"]);
  assert.equal(input.tone, "casual");
});

test("the form says what's missing or wrong", () => {
  const { errors } = parseChorus(
    form({
      title: "",
      facts: [],
      hashtags: "#no-dashes",
      questions: ["One?", "Two?", "Three?", "Four?"],
      link: "ftp://example.com",
      day: addDays(-3),
      localTime: "25:00",
    }),
  );
  assert.equal(errors.length, 7);
});

test("an unknown tone falls back to letting everyone choose", () => {
  assert.equal(parseChorus(form({ tone: "angry" })).input.tone, "any");
});

test("starting a Chorus needs a sign-in", async (t) => {
  const base = await listen(t);
  const res = await fetch(`${base}/new`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/login");
});

test("a new Chorus shows up in My Choruses, and only there", async (t) => {
  const base = await listen(t);
  const cookie = await mockSession(base, "mock_zsofia");
  const created = await fetch(`${base}/new`, {
    method: "POST",
    headers: { cookie },
    body: body(form()),
    redirect: "manual",
  });
  assert.equal(created.status, 303);
  assert.match(created.headers.get("location") ?? "", /^\/c\/[\w-]{8}$/);

  const mine = await fetch(`${base}/me`, { headers: { cookie } });
  assert.match(await mine.text(), /Northwind ships Tally 2\.0/);

  const other = await mockSession(base, "mock_sam");
  const theirs = await fetch(`${base}/me`, { headers: { cookie: other } });
  assert.doesNotMatch(await theirs.text(), /Northwind/);
});

test("a form with mistakes comes back with what was typed", async (t) => {
  const base = await listen(t);
  const cookie = await mockSession(base, "mock_dana");
  const res = await fetch(`${base}/new`, {
    method: "POST",
    headers: { cookie },
    body: body(form({ facts: [], title: "Dana's <launch>" })),
  });
  assert.equal(res.status, 400);
  const html = await res.text();
  assert.match(html, /Add at least one fact/);
  assert.match(html, /value="Dana&#39;s &lt;launch&gt;"/);
});
