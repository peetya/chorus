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
  status: "drafting" | "scheduled" | "sent" | "failed" | "withdrawn";
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
      },
      $setOnInsert: {
        _id: randomUUID(),
        status: "drafting",
        tzConfirmed: false,
        aiShaped: false,
        statusChecks: 0,
        joinedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function findPost(
  chorusId: string,
  userId: string,
): Promise<Post | null> {
  return (await posts()).findOne({ chorusId, userId });
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
