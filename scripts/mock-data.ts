// Fills a local database with mock Choruses, one for each state of the wall, so they can be tried
// without waiting for a real day: npm run mock-data. Run it again to start over: it first removes
// everything of the mock people, also the Choruses made by hand while signed in as one of them.
//
// The live ones are built around the current time, so the wall is in the middle of its day whenever
// the script runs. Their time is not 09:00, but whatever puts "now" where it should be.
import { isMock } from "../src/buffer.ts";
import { type Chorus, choruses, plusDays } from "../src/choruses.ts";
import { closeDb, db } from "../src/db.ts";
import { mockTokens, PEOPLE, seededPostId } from "../src/mock.ts";
import { type Post, posts } from "../src/posts.ts";
import { localTime, zonedToUtc } from "../src/time.ts";
import { saveUser, users } from "../src/users.ts";

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

// The Chorus time that makes this person's post go out about `minutes` from now.
function aroundNow(timeZone: string, minutes: number) {
  const at = now + minutes * MINUTE;
  const [hour, minute] = localTime(new Date(at), timeZone)
    .split(":")
    .map(Number);
  const rounded = `${String(hour).padStart(2, "0")}:${String(minute - (minute % 5)).padStart(2, "0")}`;
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

type Plan = {
  id: string;
  title: string;
  owner: string;
  day: string;
  localTime: string;
  // Who joined. Without a status the time decides: sent if it's past, scheduled if not.
  people: [string, ("drafting" | "drafted" | "failed")?, string?][];
};

const yesterday = dayIn(now - 86_400_000, "UTC");
const plans: Plan[] = [
  {
    id: "map-soon",
    title: "Coming up: our new office in Lisbon",
    owner: "mock_sam",
    day: plusDays(dayIn(now, "UTC"), 4),
    localTime: "09:00",
    people: [["mock_aiko"], ["mock_dana", "drafting"], ["mock_mark"]],
  },
  {
    id: "map-start",
    title: "Live, nobody posted yet",
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
    title: "Live, halfway round the world",
    owner: "mock_ravi",
    ...aroundNow("Europe/Budapest", -10),
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
    title: "Live, one post to go",
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
    title: "Done, everyone posted",
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
    title: "Done, some posts didn't go out",
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
];

for (const plan of plans) {
  const chorus: Chorus = {
    _id: plan.id,
    ownerId: userId(plan.owner),
    kind: "wave",
    createdAt: new Date(now),
    title: plan.title,
    facts: [
      "The new office opens on Monday",
      "It's in Lisbon, next to the river",
      "There's room for 40 people",
    ],
    link: "https://example.com/lisbon",
    hashtags: ["#LisbonOffice"],
    avoid: [],
    questions: ["What will you miss least about the old office?"],
    tone: "any",
    day: plan.day,
    localTime: plan.localTime,
  };
  await (await choruses()).insertOne(chorus);

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
    // Two people in one time zone go out a few minutes apart, like a real wave.
    const dueAt = new Date(
      zonedToUtc(plan.day, plan.localTime, channel.timezone).getTime() +
        (personId === "mock_mark" ? 3 * MINUTE : 0),
    );
    const scheduled = {
      ...base,
      text: `Our new office in Lisbon opens on Monday. ${person.name.split(" ")[0]} here, and I can't wait to see the river from my desk. #LisbonOffice`,
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
  console.log(`  https://localhost:${port}/c/${plan.id}  ${plan.title}`);
}
await closeDb();
