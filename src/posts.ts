import { randomUUID } from "node:crypto";
import type { Channel } from "./buffer.ts";
import { collection } from "./db.ts";

// One per person in a Chorus, with one channel each. The text, the time and the Buffer post come later.
export type Post = {
  _id: string;
  chorusId: string;
  userId: string;
  channelId: string;
  channelName: string;
  channelService: string; // from Buffer, never from the browser: it decides the length limit
  channelTz: string;
  text?: string; // the person's own words; only they see it until it's posted
  savedAt?: Date;
  // "scheduling" and "withdrawing" hold the post while Buffer is asked, so a double click can't
  // create two Buffer posts or delete one twice.
  // "drafted": in the person's Buffer drafts. They schedule or post it from Buffer, and the checks follow.
  status:
    | "drafting"
    | "scheduling"
    | "scheduled"
    | "drafted"
    | "withdrawing"
    | "sent"
    | "failed";
  lockedAt?: Date;
  bufferPostId?: string;
  dueAt?: Date;
  lastError?: string; // Buffer's reason when it refused or failed the post
  externalLink?: string; // the real post, once Buffer sent it
  nextCheckAt?: Date; // when to ask Buffer whether it went out
  tzConfirmed: boolean; // Buffer's time zone defaults to Europe/London, so people confirm theirs
  aiShaped: boolean;
  statusChecks: number;
  joinedAt: Date;
};

export function posts() {
  return collection<Post>("posts", [
    { key: { chorusId: 1, userId: 1 }, unique: true },
    { key: { userId: 1 } },
  ]);
}

// Joining again only changes the channel: the unique index keeps one post per person.
export async function joinChorus(
  chorusId: string,
  userId: string,
  channel: Channel,
) {
  await (await posts()).updateOne(
    { chorusId, userId },
    {
      $set: {
        channelId: channel.id,
        channelName: channel.name,
        channelService: channel.service,
        channelTz: channel.timezone,
        tzConfirmed: false,
      },
      $setOnInsert: {
        _id: randomUUID(),
        status: "drafting",
        aiShaped: false,
        statusChecks: 0,
        joinedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export const MAX_TEXT = 10_000;

// Only while drafting: once a post is scheduled, its text lives in Buffer and changes go through there.
export async function saveText(
  chorusId: string,
  userId: string,
  text: string,
): Promise<boolean> {
  const { matchedCount } = await (await posts()).updateOne(
    { chorusId, userId, status: "drafting" },
    { $set: { text: text.slice(0, MAX_TEXT), savedAt: new Date() } },
  );
  return matchedCount === 1;
}

export async function findPost(
  chorusId: string,
  userId: string,
): Promise<Post | null> {
  return (await posts()).findOne({ chorusId, userId });
}

// The texts others in the Chorus approved, for the near-duplicate check. Two people approving close
// texts in the same second can both get through; rare enough to accept.
export async function approvedByOthers(
  chorusId: string,
  userId: string,
): Promise<Post[]> {
  return (await posts())
    .find({
      chorusId,
      userId: { $ne: userId },
      status: { $in: ["scheduling", "scheduled", "drafted", "sent"] },
      text: { $exists: true },
    })
    .toArray();
}

export async function postsOf(chorusId: string): Promise<Post[]> {
  return (await posts()).find({ chorusId }).sort({ joinedAt: 1 }).toArray();
}

export async function joinedBy(userId: string): Promise<Post[]> {
  return (await posts()).find({ userId }).toArray();
}

// Buffer can't post from these, so joining with them would fail on the day.
export function channelProblem(channel: Channel): string | null {
  if (channel.isDisconnected) return "Reconnect this channel in Buffer first.";
  if (channel.isLocked) {
    return "This channel is locked in Buffer, usually because of your plan's channel limit.";
  }
  if (channel.isQueuePaused) {
    return "The queue of this channel is paused in Buffer. Unpause it first.";
  }
  return null;
}

// A lock older than this belongs to a request that died; the next one may take over.
const LOCK_MS = 2 * 60_000;
export const WITHDRAW_BEFORE_MS = 5 * 60_000;

// timeZone is the one the person confirmed on the review page.
export async function claimForScheduling(
  chorusId: string,
  userId: string,
  timeZone?: string,
): Promise<Post | null> {
  const now = new Date();
  return (await posts()).findOneAndUpdate(
    {
      chorusId,
      userId,
      $or: [
        { status: "drafting" },
        {
          status: "scheduling",
          lockedAt: { $lt: new Date(now.getTime() - LOCK_MS) },
        },
      ],
    },
    {
      $set: {
        status: "scheduling",
        lockedAt: now,
        ...(timeZone && { channelTz: timeZone, tzConfirmed: true }),
      },
      $unset: { lastError: "" },
    },
    { returnDocument: "after" },
  );
}

// Buffer has no webhooks, so the wall asks after a post's time: at most 3 times, these minutes after it.
export const CHECK_AFTER_MINUTES = [2, 15, 60];

function checkAt(dueAt: Date, checksDone: number): Date | undefined {
  const minutes = CHECK_AFTER_MINUTES[checksDone];
  return minutes === undefined
    ? undefined
    : new Date(dueAt.getTime() + minutes * 60_000);
}

export async function markScheduled(
  id: string,
  bufferPostId: string,
  dueAt: Date,
) {
  await (await posts()).updateOne(
    { _id: id },
    {
      $set: {
        status: "scheduled",
        bufferPostId,
        dueAt,
        statusChecks: 0,
        nextCheckAt: checkAt(dueAt, 0),
      },
      $unset: { lockedAt: "" },
    },
  );
}

// A draft can wait in Buffer for days, so it gets more checks, spaced out: at most this many, once an
// hour, and every 15 minutes in the hour around its time. The API budget is 500 calls a day for everyone.
export const DRAFT_CHECKS = 12;

function draftCheckAt(dueAt: Date | undefined, checksDone: number) {
  if (checksDone >= DRAFT_CHECKS) return undefined;
  const now = Date.now();
  const close = dueAt && Math.abs(dueAt.getTime() - now) < 60 * 60_000;
  return new Date(now + (close ? 15 : 60) * 60_000);
}

export async function markDrafted(
  id: string,
  bufferPostId: string,
  dueAt: Date,
) {
  await (await posts()).updateOne(
    { _id: id },
    {
      $set: {
        status: "drafted",
        bufferPostId,
        dueAt,
        statusChecks: 0,
        nextCheckAt: draftCheckAt(dueAt, 0),
      },
      $unset: { lockedAt: "" },
    },
  );
}

export async function dueForCheck(chorusId: string): Promise<Post[]> {
  return (await posts())
    .find({
      chorusId,
      status: { $in: ["scheduled", "drafted"] },
      nextCheckAt: { $lte: new Date() },
    })
    .limit(10)
    .toArray();
}

// Only one wall request gets each check: the update matches only while nobody else counted it yet.
export async function claimCheck(post: Post): Promise<boolean> {
  const done = post.statusChecks + 1;
  const next =
    post.status === "drafted"
      ? draftCheckAt(post.dueAt, done)
      : post.dueAt && checkAt(post.dueAt, done);
  const { modifiedCount } = await (await posts()).updateOne(
    { _id: post._id, status: post.status, statusChecks: post.statusChecks },
    next
      ? { $inc: { statusChecks: 1 }, $set: { nextCheckAt: next } }
      : { $inc: { statusChecks: 1 }, $unset: { nextCheckAt: "" } },
  );
  return modifiedCount === 1;
}

export async function markSent(id: string, externalLink: string | null) {
  await (await posts()).updateOne(
    { _id: id },
    {
      $set: { status: "sent", ...(externalLink && { externalLink }) },
      $unset: { nextCheckAt: "" },
    },
  );
}

export async function markFailed(id: string, lastError: string) {
  await (await posts()).updateOne(
    { _id: id },
    { $set: { status: "failed", lastError }, $unset: { nextCheckAt: "" } },
  );
}

// Back to an editable draft: after Buffer refused it, or after it was withdrawn.
export async function backToDraft(id: string, lastError?: string) {
  await (await posts()).updateOne(
    { _id: id },
    {
      $set: { status: "drafting", ...(lastError && { lastError }) },
      $unset: { lockedAt: "", bufferPostId: "", dueAt: "", nextCheckAt: "" },
    },
  );
}

// Only well before it goes out: deleting it at the last minute could remove a live post. A draft
// doesn't go out, so it can come back any time.
export async function claimForWithdraw(
  chorusId: string,
  userId: string,
): Promise<Post | null> {
  return (await posts()).findOneAndUpdate(
    {
      chorusId,
      userId,
      $or: [
        {
          status: "scheduled",
          dueAt: { $gt: new Date(Date.now() + WITHDRAW_BEFORE_MS) },
        },
        { status: "drafted" },
      ],
    },
    { $set: { status: "withdrawing", lockedAt: new Date() } },
    { returnDocument: "before" },
  );
}

// The person scheduled their draft in Buffer: from now on it's checked like any scheduled post.
export async function draftScheduled(id: string, dueAt: Date) {
  await (await posts()).updateOne(
    { _id: id, status: "drafted" },
    {
      $set: {
        status: "scheduled",
        dueAt,
        statusChecks: 0,
        nextCheckAt: checkAt(dueAt, 0),
      },
    },
  );
}

// Back to what it was in Buffer, after a withdraw that didn't happen.
export async function stillScheduled(
  id: string,
  status: "scheduled" | "drafted",
) {
  await (await posts()).updateOne(
    { _id: id },
    { $set: { status }, $unset: { lockedAt: "" } },
  );
}
