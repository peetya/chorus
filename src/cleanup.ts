// What Chorus keeps, and for how long. Tokens and drafts go a day after a person's last Chorus is over,
// images too, once no post still waits to go out with one. The finished wall stays: first name and
// initial, network, time zone, the link to the real post.
import { addDays, choruses, plusDays } from "./choruses.ts";
import { deleteImages, images as imageRecords } from "./images.ts";
import { posts } from "./posts.ts";
import { dropTokens, users } from "./users.ts";

const DAY_MS = 86_400_000;

// A wave is over two days after its day (see isOver), a relay sooner, and the data goes the day after that.
const KEEP_DAYS = 3;

// The day of the person's last Chorus, organized or joined.
export async function lastChorusDay(userId: string): Promise<string | null> {
  const joined = await (await posts())
    .find({ userId }, { projection: { chorusId: 1 } })
    .toArray();
  const [last] = await (await choruses())
    .find(
      {
        $or: [
          { ownerId: userId },
          { _id: { $in: joined.map((post) => post.chorusId) } },
        ],
      },
      { projection: { day: 1 } },
    )
    .sort({ day: -1 })
    .limit(1)
    .toArray();
  return last?.day ?? null;
}

// The day the daily cleanup deletes this person's Buffer connection, or null for "a day after sign-in".
export async function tokensGoOn(userId: string): Promise<string | null> {
  const last = await lastChorusDay(userId);
  return last && plusDays(last, KEEP_DAYS);
}

// "Delete my data": the person, their posts, and the Choruses they organize with everyone's posts in
// them. Posts already in someone's Buffer queue stay there; the page says so before.
export async function deleteUserData(userId: string) {
  const owned = await (await choruses())
    .find({ ownerId: userId }, { projection: { _id: 1 } })
    .toArray();
  const ownedIds = owned.map((chorus) => chorus._id);
  // Their own images, and every image in the Choruses they organize, other people's own ones too.
  await deleteImages({
    $or: [{ ownerId: userId }, { chorusId: { $in: ownedIds } }],
  });
  await (await posts()).deleteMany({
    $or: [{ userId }, { chorusId: { $in: ownedIds } }],
  });
  await (await choruses()).deleteMany({ _id: { $in: ownedIds } });
  await (await users()).deleteOne({ _id: userId });
}

// Runs once a day (vercel.json). Safe to run more often: it only removes what is already past its time.
export async function dailyCleanup(): Promise<{
  tokens: number;
  texts: number;
  images: number;
}> {
  const cutoff = addDays(-KEEP_DAYS);
  const old = await (await choruses())
    .find({ day: { $lte: cutoff } }, { projection: { _id: 1 } })
    .toArray();
  const { modifiedCount: texts } = await (await posts()).updateMany(
    {
      chorusId: { $in: old.map((chorus) => chorus._id) },
      text: { $exists: true },
    },
    { $unset: { text: "", answers: "", lastError: "" } },
  );

  // Buffer fetches an image when the post goes out, so a Chorus keeps its images while a post is still
  // due, like a draft the person scheduled for later in Buffer.
  const withImages = (
    await (
      await imageRecords()
    ).distinct("chorusId", { chorusId: { $ne: null } })
  ).filter((id): id is string => id !== null);
  const done = (
    await (
      await choruses()
    )
      .find(
        { _id: { $in: withImages }, day: { $lte: cutoff } },
        { projection: { _id: 1 } },
      )
      .toArray()
  ).map((chorus) => chorus._id);
  const waiting = await (await posts()).distinct("chorusId", {
    chorusId: { $in: done },
    dueAt: { $gt: new Date() },
  });
  // Images from a "Start a Chorus" form that was never sent.
  const images =
    (await deleteImages({
      chorusId: { $in: done.filter((id) => !waiting.includes(id)) },
    })) +
    (await deleteImages({
      chorusId: null,
      createdAt: { $lt: new Date(Date.now() - 86_400_000) },
    }));

  // Two queries per connected person, once a day. Fine for a few thousand people.
  let tokens = 0;
  const connected = await (await users())
    .find({ tokenEnc: { $exists: true } }, { projection: { signedInAt: 1 } })
    .toArray();
  for (const user of connected) {
    const recent =
      user.signedInAt && user.signedInAt.getTime() > Date.now() - DAY_MS;
    const last = await lastChorusDay(user._id);
    if (recent || (last && last > cutoff)) continue;
    await dropTokens(user._id);
    tokens++;
  }
  return { tokens, texts, images };
}
