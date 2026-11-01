import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, type Chorus, type Relay } from "../src/choruses.ts";
import type { Post } from "../src/posts.ts";
import { myChoruses } from "../src/views/my-choruses.ts";

function chorus(_id: string, day: string): Chorus {
  return {
    _id,
    day,
    title: `Chorus ${_id}`,
    localTime: "09:00",
    kind: "wave",
    ownerId: "u1",
    createdAt: new Date(),
    facts: [],
    hashtags: [],
    avoid: [],
    questions: [],
    tone: "any",
  };
}

const minutes = (n: number) => new Date(Date.now() + n * 60_000);

function person(
  name: string,
  channelTz: string,
  dueAt: Date,
  status: Post["status"],
) {
  return { name, post: { channelTz, dueAt, status } as Post & { dueAt: Date } };
}

test("a live wave's card shows its map, how many posted and who's next", () => {
  const page = myChoruses([
    {
      chorus: chorus("live1", addDays(0)),
      organizer: null,
      people: [
        person("Aiko Tanaka", "Asia/Tokyo", minutes(-300), "sent"),
        person("Zsófia Kiss", "Europe/Budapest", minutes(-20), "sent"),
        person("Dana Rossi", "America/New_York", minutes(47), "scheduled"),
      ],
    },
    { chorus: chorus("soon1", addDays(5)), organizer: null },
  ]).value;
  assert.match(page, /<a href="\/c\/live1" class="chorus-card live">/);
  assert.match(page, /2 of 3 posted/);
  assert.match(page, /next: Dana R\. in New York, in 4[78] min/);
  assert.match(page, /class="world-map"/);
  assert.match(page, /class="map-pulse"/);
  // Only the live card has a map.
  assert.equal((page.match(/class="world-map"/g) ?? []).length, 1);
  assert.match(page, /<a href="\/c\/soon1" class="chorus-card">/);
});

test("a live wave with nothing scheduled yet says so", () => {
  const page = myChoruses([
    {
      chorus: chorus("live2", addDays(0)),
      organizer: "Péter Halász",
      people: [],
    },
  ]).value;
  assert.match(page, /No posts are scheduled yet/);
  assert.match(page, /organized by Péter H\./);
});

test("a live relay's card shows the sun's path, and who's next at their time", () => {
  const relay: Relay = {
    ...chorus("relay1", addDays(0)),
    kind: "relay",
    relayTz: "Europe/Budapest",
    relayGapMin: 60,
    localTime: "00:00",
  };
  const page = myChoruses([
    {
      chorus: relay,
      organizer: null,
      people: [
        person("Aiko Tanaka", "Asia/Tokyo", minutes(-30), "sent"),
        person("Dana Rossi", "America/New_York", minutes(20), "scheduled"),
      ],
    },
  ]).value;
  assert.match(page, /class="chorus-card live"/);
  assert.match(page, /1 of 2 posted/);
  assert.match(page, /next: Dana R\. at \d\d:\d\d, in (19|20) min/);
  assert.match(page, /class="sun-frame"/);
  // Dots only: faces would need their initials, and the card hides the drawing's text.
  assert.doesNotMatch(page, /r="6\.4"/);
  assert.doesNotMatch(page, /class="world-map"/);
});
