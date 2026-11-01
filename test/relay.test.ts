import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, choruses, parseChorus } from "../src/choruses.ts";
import { posts } from "../src/posts.ts";
import { relayTimes } from "../src/time.ts";
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

// Reykjavik is on UTC all year, so the slot times are easy to check.
const ZONE = "Atlantic/Reykjavik";

function form(overrides: Record<string, string> = {}) {
  return {
    title: "Northwind ships Tally 2.0",
    facts: "Tally 2.0 is out today.",
    hashtags: "#TallyLaunch",
    questions: "What do you like most?",
    day: addDays(14),
    kind: "relay",
    localTime: "09:00",
    relayGapMin: "60",
    relayTz: ZONE,
    ...overrides,
  };
}

function post(
  base: string,
  path: string,
  cookie: string,
  fields: Record<string, string> = {},
) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { cookie },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });
}

async function page(base: string, path: string, cookie = "") {
  return (await fetch(`${base}${path}`, { headers: { cookie } })).text();
}

// Zsófia's relay. Returns its path.
async function startRelay(base: string, fields: Record<string, string>) {
  const owner = await mockSession(base, "mock_zsofia");
  await finishOpenChoruses();
  const created = await post(base, "/new", owner, form(fields));
  assert.equal(created.status, 303);
  return created.headers.get("location") ?? "";
}

// Different words for each person, so the near-duplicate check lets them all through.
const TEXTS: Record<string, string> = {
  mock_ravi: "Shipping day! Tally 2.0 is out today. #TallyLaunch",
  mock_aiko: "Proud of the team. Tally 2.0 is out today. #TallyLaunch",
  mock_dana: "Tally 2.0 is out today and I love the new reports. #TallyLaunch",
  mock_sam: "Big news from Northwind: Tally 2.0 is out today. #TallyLaunch",
};

// A person who joined and wrote their post. Returns their cookie.
async function drafted(
  base: string,
  path: string,
  person: string,
  channelId: string,
) {
  const cookie = await mockSession(base, person);
  await post(base, `${path}/join`, cookie, { channelId });
  await post(base, `${path}/post`, cookie, {
    text: TEXTS[person],
  });
  return cookie;
}

async function postOf(path: string, channelId: string) {
  return (await posts()).findOne({ chorusId: path.slice(3), channelId });
}

test("a relay's slots run from the first post until before 18:00", () => {
  assert.deepEqual(relayTimes("09:00", 60).slice(0, 2), ["09:00", "10:00"]);
  assert.equal(relayTimes("09:00", 45).length, 12);
  assert.equal(relayTimes("09:00", 45).at(-1), "17:15");
  assert.deepEqual(relayTimes("17:50", 20), ["17:50"]);
  assert.deepEqual(relayTimes("18:00", 20), []);
});

test("the form checks the relay's time zone, gap and first post", () => {
  const ok = parseChorus(form());
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.input.kind, "relay");
  assert.equal(ok.input.relayGapMin, 60);

  const { errors } = parseChorus(
    form({ relayTz: "Mars/Olympus", relayGapMin: "25", localTime: "18:30" }),
  );
  assert.deepEqual(errors, [
    "Pick the time zone of the relay.",
    "Pick how often a new post goes out.",
    "A relay's first post must be before 18:00.",
  ]);

  const wave = parseChorus(form({ kind: "wave", relayTz: "nonsense" }));
  assert.deepEqual(wave.errors, []);
  assert.equal(wave.input.relayTz, undefined);
});

test("people approving at the same moment get different slots, in the relay's time zone", async (t) => {
  const base = await listen(t);
  const path = await startRelay(base, { day: addDays(1) });
  const people = [
    await drafted(base, path, "mock_ravi", "ch_ravi_x"),
    await drafted(base, path, "mock_aiko", "ch_aiko_li"),
    await drafted(base, path, "mock_dana", "ch_dana_li"),
  ];
  const review = await page(base, `${path}/post/review`, people[0]);
  assert.match(review, /goes out at <strong>09:00 Reykjavik time<\/strong>/);
  assert.match(review, /1st in line/);
  assert.doesNotMatch(review, /Your time zone/);

  await Promise.all(
    people.map((cookie) => post(base, `${path}/post/approve`, cookie)),
  );
  const saved = await (await posts())
    .find({ chorusId: path.slice(3) })
    .toArray();
  assert.deepEqual(saved.map((p) => p.relaySlot).sort(), [0, 1, 2]);
  for (const one of saved) {
    assert.equal(one.status, "scheduled");
    const hour = String(9 + (one.relaySlot ?? 0)).padStart(2, "0");
    // Each in the relay's zone, not their own (Kolkata, Tokyo, New York).
    assert.equal(one.dueAt?.toISOString(), `${addDays(1)}T${hour}:00:00.000Z`);
  }
  const own = await page(base, path, people[0]);
  assert.match(own, /Reykjavik time, \d(st|nd|rd) in line/);
});

test("a full relay says so and leaves the post a draft", async (t) => {
  const base = await listen(t);
  // 17:00 every hour: one slot.
  const path = await startRelay(base, {
    day: addDays(1),
    localTime: "17:00",
  });
  const first = await drafted(base, path, "mock_ravi", "ch_ravi_x");
  const second = await drafted(base, path, "mock_aiko", "ch_aiko_li");
  await post(base, `${path}/post/approve`, first);
  assert.equal((await postOf(path, "ch_ravi_x"))?.relaySlot, 0);

  const res = await post(base, `${path}/post/approve`, second);
  assert.equal(res.headers.get("location"), `${path}/post/review`);
  const late = await postOf(path, "ch_aiko_li");
  assert.equal(late?.status, "drafting");
  assert.equal(late?.relaySlot, undefined);
  assert.match(
    await page(base, `${path}/post/review`, second),
    /This relay is full/,
  );
});

test("slots that have passed are skipped", async (t) => {
  const base = await listen(t);
  const path = await startRelay(base, {
    day: addDays(1),
    localTime: "00:00",
    relayGapMin: "20",
  });
  // The relay is today, so the slots before now (and the next few minutes) are gone.
  await (await choruses()).updateOne(
    { _id: path.slice(3) },
    { $set: { day: addDays(0) } },
  );
  const cookie = await drafted(base, path, "mock_sam", "ch_sam_li");
  await post(base, `${path}/post/approve`, cookie);
  const saved = await postOf(path, "ch_sam_li");
  const open = relayTimes("00:00", 20).findIndex(
    (time) => Date.parse(`${addDays(0)}T${time}:00Z`) > Date.now() + 5 * 60_000,
  );
  if (open === -1) {
    assert.equal(saved?.status, "drafting");
  } else {
    assert.equal(saved?.relaySlot, open);
    assert.ok((saved?.dueAt?.getTime() ?? 0) > Date.now());
  }
});

test("a withdrawn post keeps its slot", async (t) => {
  const base = await listen(t);
  const path = await startRelay(base, { day: addDays(1) });
  const ravi = await drafted(base, path, "mock_ravi", "ch_ravi_x");
  const aiko = await drafted(base, path, "mock_aiko", "ch_aiko_li");
  await post(base, `${path}/post/approve`, ravi);
  await post(base, `${path}/post/withdraw`, ravi);
  assert.equal((await postOf(path, "ch_ravi_x"))?.status, "drafting");
  await post(base, `${path}/post/approve`, aiko);
  assert.equal((await postOf(path, "ch_aiko_li"))?.relaySlot, 1);
  await post(base, `${path}/post/approve`, ravi);
  const back = await postOf(path, "ch_ravi_x");
  assert.equal(back?.relaySlot, 0);
  assert.equal(back?.dueAt?.toISOString(), `${addDays(1)}T09:00:00.000Z`);
});

test("the relay wall shows the sun's path and everyone in slot order, then the finished view", async (t) => {
  const base = await listen(t);
  const path = await startRelay(base, { day: addDays(1) });
  const ravi = await drafted(base, path, "mock_ravi", "ch_ravi_x");
  const aiko = await drafted(base, path, "mock_aiko", "ch_aiko_li");
  await post(base, `${path}/post/approve`, ravi);
  await post(base, `${path}/post/approve`, aiko);

  // Move the relay to today: Ravi posted an hour ago, Aiko is next in an hour.
  const id = path.slice(3);
  await (await choruses()).updateOne(
    { _id: id },
    { $set: { day: addDays(0) } },
  );
  await (await posts()).updateOne(
    { chorusId: id, channelId: "ch_ravi_x" },
    {
      $set: {
        status: "sent",
        dueAt: new Date(Date.now() - 60 * 60_000),
        externalLink: "https://x.com/ravi_builds/status/1",
      },
      $unset: { nextCheckAt: "" },
    },
  );
  await (await posts()).updateOne(
    { chorusId: id, channelId: "ch_aiko_li" },
    {
      $set: {
        dueAt: new Date(Date.now() + 60 * 60_000),
        nextCheckAt: new Date(Date.now() + 62 * 60_000),
      },
    },
  );

  const wall = await page(base, path);
  assert.match(wall, /Live now · Relay/);
  assert.match(wall, /The sun over Reykjavik today/);
  assert.match(wall, /<svg viewBox="0 0 360 142"/);
  assert.match(wall, /<strong>1 of 2<\/strong> posts are out/);
  assert.match(wall, /next: Aiko T\./);
  assert.match(wall, /Next, in (59 min|1 h)/);
  assert.ok(
    wall.indexOf("Ravi K.</strong>") < wall.indexOf("Aiko T.</strong>"),
  );
  assert.match(wall, /href="https:\/\/x.com\/ravi_builds\/status\/1"/);

  const polled = await page(base, `${path}/wall`);
  assert.match(polled, /The sun over Reykjavik today/);
  assert.doesNotMatch(polled, /<html/);

  await (await choruses()).updateOne(
    { _id: id },
    { $set: { day: addDays(-2) } },
  );
  const finished = await page(base, path);
  assert.match(finished, /Done · Relay/);
  assert.match(finished, /1 of 2 posts went out/);
  assert.match(finished, /At \d\d:\d\d in Reykjavik\./);
  assert.match(finished, /who spoke when/);
});

test("the dashboard and My Choruses show the relay's timing", async (t) => {
  const base = await listen(t);
  const path = await startRelay(base, { day: addDays(1), relayGapMin: "45" });
  const owner = await mockSession(base, "mock_zsofia");
  const dashboard = await page(base, path, owner);
  assert.match(
    dashboard,
    /from 09:00 Reykjavik time, a new voice every 45 min · 0 of 12 slots taken/,
  );
  const mine = await page(base, "/me", owner);
  assert.match(mine, /Relay from 09:00 Reykjavik time/);
});

test("the form offers a wave or a relay, and keeps the relay's fields after an error", async (t) => {
  const base = await listen(t);
  const owner = await mockSession(base, "mock_zsofia");
  await finishOpenChoruses();
  const blank = await page(base, "/new", owner);
  assert.match(blank, /name="kind" value="wave" checked/);
  assert.match(blank, /name="kind" value="relay">/);
  assert.match(blank, /data-slot-hint>12 people: 09:00 to 17:15/);
  assert.match(
    blank,
    /<option value="Europe\/Budapest">Budapest \(Europe\/Budapest\)/,
  );

  const res = await post(
    base,
    "/new",
    owner,
    form({ title: "", relayTz: "Europe/Budapest", relayGapMin: "20" }),
  );
  assert.equal(res.status, 400);
  const again = await res.text();
  assert.match(again, /name="kind" value="relay" checked/);
  assert.match(again, /<option value="Europe\/Budapest" selected>/);
  assert.match(again, /<option value="20" selected>20 min/);
});
