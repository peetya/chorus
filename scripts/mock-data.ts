// Fills a local database with mock Choruses, one for each state of the wall, so they can be tried
// without waiting for a real day: npm run mock-data. Run it again to start over: it first removes
// everything of the mock people, also the Choruses made by hand while signed in as one of them.
//
// The live ones are built around the current time, so the wall is in the middle of its day whenever
// the script runs. Their time is not 09:00, but whatever puts "now" where it should be. Each Chorus is a
// made-up team with its own news, so the pages look like they will with real people.
import { isMock } from "../src/buffer.ts";
import {
  type Chorus,
  choruses,
  plusDays,
  type Relay,
  relaySlots,
} from "../src/choruses.ts";
import { closeDb, db } from "../src/db.ts";
import { deleteImages } from "../src/images.ts";
import { mockTokens, PEOPLE, seededPostId } from "../src/mock.ts";
import { type Post, posts } from "../src/posts.ts";
import { localTime, zonedToUtc } from "../src/time.ts";
import { saveUser, users } from "../src/users.ts";
import { PLACES } from "../src/zones.ts";

if (!isMock())
  throw new Error("Run it with BUFFER_MOCK=1, in .env or before the command.");
const uri = process.env.MONGODB_URI ?? "";
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)[:/]/.test(uri)) {
  throw new Error(
    "Only for a local database: MONGODB_URI must point to localhost.",
  );
}

const now = Date.now();
const MINUTE = 60_000;

// "2026-11-11" in that time zone.
function dayIn(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
}

// The Chorus time that makes this person's post go out about `minutes` from now, rounded down to `step`
// minutes.
function aroundNow(timeZone: string, minutes: number, step = 5) {
  const at = now + minutes * MINUTE;
  const [hour, minute] = localTime(new Date(at), timeZone)
    .split(":")
    .map(Number);
  const rounded = `${String(hour).padStart(2, "0")}:${String(minute - (minute % step)).padStart(2, "0")}`;
  return { day: dayIn(at, timeZone), localTime: rounded };
}

const ids = new Map<string, string>();
for (const person of PEOPLE) {
  ids.set(
    person.id,
    await saveUser(
      {
        id: person.id,
        name: person.name,
        organizations: [{ id: `org_${person.id}` }],
      },
      mockTokens(person.id),
    ),
  );
}
const userId = (personId: string) => ids.get(personId) ?? "";

// Start over: everything the mock people made or joined.
const mockUsers = [...ids.values()];
const oldChoruses = await (await choruses())
  .find({ ownerId: { $in: mockUsers } }, { projection: { _id: 1 } })
  .toArray();
const removed = (
  await (
    await posts()
  ).deleteMany({
    $or: [
      { userId: { $in: mockUsers } },
      { chorusId: { $in: oldChoruses.map((c) => c._id) } },
    ],
  })
).deletedCount;
await (await choruses()).deleteMany({ ownerId: { $in: mockUsers } });
await deleteImages({ ownerId: { $in: mockUsers } });

// What a Chorus is about. post() is what each person wrote, from their first name.
type Story = {
  title: string;
  facts: string[];
  link: string;
  hashtag: string;
  question: string;
  post: (first: string) => string;
};

type Plan = Story & {
  id: string;
  state: string; // for the list at the end
  owner: string;
  day: string;
  localTime: string;
  relay?: { tz: string; gap: number };
  // Who joined. Without a status the time decides: sent if it's past, scheduled if not. In a relay
  // everyone who isn't drafting takes the next slot.
  people: [string, ("drafting" | "drafted" | "failed")?, string?][];
};

// A live relay needs slots on both sides of now, before 18:00. Somewhere it's late morning: a familiar
// city if possible, or any time zone on the map.
const relayZone = [
  "Europe/Budapest",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
  ...Object.keys(PLACES),
].find((zone) => {
  const hour = Number(localTime(new Date(now), zone).slice(0, 2));
  return hour >= 10 && hour < 14;
});
if (!relayZone) throw new Error("No time zone has late morning now?");

const yesterday = dayIn(now - 86_400_000, "UTC");
const plans: Plan[] = [
  {
    id: "map-soon",
    state: "Coming up, with one person still writing",
    title: "Northwind opens its Lisbon office",
    facts: [
      "The Lisbon office opens on Monday",
      "It's next to the river, in Cais do Sodré",
      "There's room for 40 people",
    ],
    link: "https://northwind.example/lisbon",
    hashtag: "#NorthwindLisbon",
    question: "What are you looking forward to in the new office?",
    post: (first) =>
      `Our Lisbon office opens on Monday, right next to the river. ${first} here: I've worked from my kitchen for two years, so I'm counting the days. #NorthwindLisbon`,
    owner: "mock_sam",
    day: plusDays(dayIn(now, "UTC"), 4),
    localTime: "09:00",
    people: [["mock_aiko"], ["mock_dana", "drafting"], ["mock_mark"]],
  },
  {
    id: "map-start",
    state: "Live, nobody posted yet",
    title: "Brightline 1.0 is out",
    facts: [
      "Brightline 1.0 is out today",
      "It's open source, under the MIT license",
      "120 people sent a pull request on the way to 1.0",
    ],
    link: "https://brightline.example/1-0",
    hashtag: "#Brightline1",
    question: "What was your first pull request to Brightline?",
    post: (first) =>
      `Brightline 1.0 is out. My first pull request fixed a typo in the README, and here we are. 120 people got it to 1.0, ${first} is proud to be one of them. #Brightline1`,
    owner: "mock_aiko",
    ...aroundNow("Australia/Sydney", 40),
    people: [
      ["mock_chloe"],
      ["mock_aiko"],
      ["mock_ravi"],
      ["mock_zsofia"],
      ["mock_mark"],
      ["mock_sam"],
      ["mock_dana"],
      ["mock_maya", "drafting"],
    ],
  },
  {
    id: "map-half",
    state: "Live, halfway round the world",
    title: "Tidepool 2.0 is out",
    facts: [
      "Tidepool 2.0 is out today",
      "Notes now sync offline, on every device",
      "It's free for teams of up to 10 people",
    ],
    link: "https://tidepool.example/2-0",
    hashtag: "#Tidepool2",
    question: "What did you build or fix for 2.0?",
    post: (first) =>
      `Tidepool 2.0 is out today. I spent the summer on offline sync, so your notes now work on a plane too. Free for teams of up to 10. ${first}, very tired and very happy. #Tidepool2`,
    owner: "mock_ravi",
    ...aroundNow("Europe/Budapest", -10, 60),
    people: [
      ["mock_chloe"],
      ["mock_aiko"],
      ["mock_ravi"],
      ["mock_zsofia", "failed", "ch_zsofia_bsky"],
      ["mock_mark"],
      ["mock_sam"],
      ["mock_dana"],
      ["mock_maya"],
    ],
  },
  {
    id: "map-end",
    state: "Live, one post to go",
    title: "Kettle is hiring 5 engineers",
    facts: [
      "Kettle is hiring 5 engineers",
      "The jobs are remote, from anywhere in Europe or the Americas",
      "Applications are open until December 1",
    ],
    link: "https://kettle.example/jobs",
    hashtag: "#KettleHiring",
    question: "Why would you tell a friend to work here?",
    post: (first) =>
      `We're hiring 5 engineers at Kettle, fully remote. ${first} here: the best part is a team that writes things down, so nobody needs to be online at 3 am. Open until December 1. #KettleHiring`,
    owner: "mock_dana",
    ...aroundNow("America/Los_Angeles", 30),
    people: [
      ["mock_chloe"],
      ["mock_aiko"],
      ["mock_ravi"],
      ["mock_zsofia"],
      ["mock_mark"],
      ["mock_sam", "drafted"],
      ["mock_dana"],
      ["mock_maya"],
    ],
  },
  {
    id: "map-done",
    state: "Done, everyone posted",
    title: "The Harbor Conf 2026 speakers are in",
    facts: [
      "Harbor Conf is on March 12 and 13, 2027",
      "There are 24 talks, all in English",
      "Tickets go on sale on December 1",
    ],
    link: "https://harborconf.example/speakers",
    hashtag: "#HarborConf",
    question: "What's your talk about, in one sentence?",
    post: (first) =>
      `I'm speaking at Harbor Conf in March! ${first}'s talk is about the bug that took me a week to find, and the one line that fixed it. Tickets from December 1. #HarborConf`,
    owner: "mock_zsofia",
    day: plusDays(yesterday, -2),
    localTime: "09:00",
    people: [
      ["mock_chloe"],
      ["mock_aiko"],
      ["mock_ravi"],
      ["mock_zsofia"],
      ["mock_mark"],
      ["mock_sam"],
      ["mock_dana"],
      ["mock_maya"],
    ],
  },
  {
    id: "map-missed",
    state: "Done, some posts didn't go out",
    title: "Paperclip turns 5",
    facts: [
      "Paperclip is 5 years old today",
      "It started as a weekend project",
      "Over 2,000 teams use it every day",
    ],
    link: "https://paperclip.example/five",
    hashtag: "#Paperclip5",
    question: "What do you remember from your first week?",
    post: (first) =>
      `Paperclip is 5 today. It started as a weekend project, and now 2,000 teams use it every day. ${first} still remembers the first customer email. #Paperclip5`,
    owner: "mock_mark",
    day: plusDays(yesterday, -3),
    localTime: "09:00",
    people: [
      ["mock_aiko"],
      ["mock_ravi", "failed"],
      ["mock_zsofia"],
      ["mock_mark"],
      ["mock_sam", "drafting"],
      ["mock_dana", "failed"],
      ["mock_maya"],
    ],
  },
  {
    id: "relay-live",
    state: "Relay, live: one voice every 30 minutes",
    title: "Pocket Orbit launch day",
    facts: [
      "Pocket Orbit is out today on Switch and Steam",
      "It costs 12 euros",
      "A team of 7 made it in 2 years",
    ],
    link: "https://littlerobot.example/pocket-orbit",
    hashtag: "#PocketOrbit",
    question: "What's your favorite level, and why?",
    post: (first) =>
      `Pocket Orbit is out today on Switch and Steam! Seven of us made it in two years. ${first}'s favorite level is the one where gravity turns off halfway. #PocketOrbit`,
    owner: "mock_mark",
    ...aroundNow(relayZone, -100, 30),
    relay: { tz: relayZone, gap: 30 },
    people: [
      ["mock_chloe"],
      ["mock_aiko"],
      ["mock_ravi"],
      ["mock_zsofia"],
      ["mock_sam"],
      ["mock_dana"],
      ["mock_maya", "drafting"],
    ],
  },
  {
    id: "relay-full",
    state: "Relay, full: one slot, already taken",
    title: "Danube Devs meetup #42 tonight",
    facts: [
      "Danube Devs #42 is tonight at 18:30",
      "Two talks: one on testing, one on accessibility",
      "Pizza is on the house",
    ],
    link: "https://danubedevs.example/42",
    hashtag: "#DanubeDevs",
    question: "Why should someone come tonight?",
    post: (first) =>
      `Danube Devs #42 is tonight at 18:30: a talk on testing, one on accessibility, and pizza. ${first} will be there early. #DanubeDevs`,
    owner: "mock_maya",
    day: plusDays(dayIn(now, "Europe/Budapest"), 1),
    localTime: "17:00",
    relay: { tz: "Europe/Budapest", gap: 60 },
    people: [
      ["mock_aiko"],
      ["mock_ravi", "drafting"],
      ["mock_sam", "drafting"],
    ],
  },
  {
    id: "relay-done",
    state: "Relay, done",
    title: "Kiosk Bakery turns one",
    facts: [
      "Kiosk Bakery opened one year ago today",
      "It bakes 300 loaves every morning",
      "Every coffee is half price today",
    ],
    link: "https://kioskbakery.example/one",
    hashtag: "#KioskOne",
    question: "What's the one thing everyone should try?",
    post: (first) =>
      `Kiosk Bakery is one year old today, and every coffee is half price. ${first}'s tip: the cardamom bun, before 9, before it's gone. #KioskOne`,
    owner: "mock_zsofia",
    day: plusDays(dayIn(now, "Europe/Budapest"), -3),
    localTime: "09:00",
    relay: { tz: "Europe/Budapest", gap: 45 },
    people: [
      ["mock_zsofia"],
      ["mock_mark"],
      ["mock_sam"],
      ["mock_aiko"],
      ["mock_chloe"],
      ["mock_dana"],
    ],
  },
];

for (const plan of plans) {
  const chorus: Chorus = {
    _id: plan.id,
    ownerId: userId(plan.owner),
    kind: plan.relay ? "relay" : "wave",
    relayTz: plan.relay?.tz,
    relayGapMin: plan.relay?.gap,
    createdAt: new Date(now),
    title: plan.title,
    facts: plan.facts,
    link: plan.link,
    hashtags: [plan.hashtag],
    avoid: [],
    questions: [plan.question],
    tone: "any",
    day: plan.day,
    localTime: plan.localTime,
  };
  await (await choruses()).insertOne(chorus);
  const slots = plan.relay ? relaySlots(chorus as Relay) : [];
  let nextSlot = 0;

  const joined = plan.people.map(([personId, status, channelId], i): Post => {
    const person = PEOPLE.find((p) => p.id === personId);
    if (!person) throw new Error(`No mock person ${personId}`);
    const channel =
      person.channels.find((c) => c.id === channelId) ?? person.channels[0];
    const base = {
      _id: `${plan.id}.${personId}`,
      chorusId: plan.id,
      userId: userId(personId),
      channelId: channel.id,
      channelName: channel.name,
      channelService: channel.service,
      channelTz: channel.timezone,
      tzConfirmed: true,
      aiShaped: false,
      statusChecks: 0,
      joinedAt: new Date(now - (60 - i) * MINUTE),
    };
    if (status === "drafting") return { ...base, status };
    const relaySlot = plan.relay ? nextSlot++ : undefined;
    // Two people in one time zone go out a few minutes apart, like a real wave.
    const dueAt =
      relaySlot !== undefined
        ? slots[relaySlot]
        : new Date(
            zonedToUtc(plan.day, plan.localTime, channel.timezone).getTime() +
              (personId === "mock_mark" ? 3 * MINUTE : 0),
          );
    const scheduled = {
      ...base,
      relaySlot,
      text: plan.post(person.name.split(" ")[0]),
      bufferPostId: seededPostId(personId, dueAt),
      dueAt,
    };
    if (status === "failed") {
      return {
        ...scheduled,
        status,
        lastError: `${channel.service === "bluesky" ? "Bluesky" : "The network"} didn't accept the post (mock)`,
      };
    }
    if (status === "drafted") return { ...scheduled, status };
    if (dueAt.getTime() <= now) {
      return {
        ...scheduled,
        status: "sent",
        externalLink: `https://example.com/mock/${scheduled.bufferPostId}`,
      };
    }
    // Checked like a real post: the wall turns it to sent a couple of minutes after its time.
    return {
      ...scheduled,
      status: "scheduled",
      nextCheckAt: new Date(dueAt.getTime() + 2 * MINUTE),
    };
  });
  await (await posts()).insertMany(joined);
}

const port = process.env.PORT ?? "3000";
console.log(
  `Removed ${removed} old mock posts. ${(await (await users()).countDocuments({ providerAccountId: /^mock_/ })) || 0} mock people in ${db().databaseName}.`,
);
for (const plan of plans) {
  console.log(`  https://localhost:${port}/c/${plan.id}  ${plan.state}`);
}
await closeDb();
