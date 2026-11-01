// Mock mode (BUFFER_MOCK=1): fake people and fake Buffer answers, so Chorus runs without a Buffer account.
// The answers have the same shape as Buffer's. Each new Buffer call adds its answer here.
import { randomBytes } from "node:crypto";
import {
  type Account,
  BufferApiError,
  type BufferPost,
  type Channel,
  TokenError,
  type Tokens,
} from "./buffer.ts";

function channel(
  id: string,
  name: string,
  service: string,
  timezone: string,
  problem?: "isQueuePaused" | "isLocked" | "isDisconnected",
): Channel {
  return {
    id,
    name,
    service,
    timezone,
    isQueuePaused: problem === "isQueuePaused",
    isLocked: problem === "isLocked",
    isDisconnected: problem === "isDisconnected",
  };
}

// A spread of time zones, so a wave can be tried around the world. The id is also the access token.
// Three channels can't be used (paused, locked, disconnected), so those cases can be tried too.
export const PEOPLE = [
  {
    id: "mock_chloe",
    name: "Chloe Nguyen",
    city: "Sydney",
    channels: [
      channel("ch_chloe_li", "Chloe Nguyen", "linkedin", "Australia/Sydney"),
      channel("ch_chloe_ig", "chloe.ng", "instagram", "Australia/Sydney"),
    ],
  },
  {
    id: "mock_aiko",
    name: "Aiko Tanaka",
    city: "Tokyo",
    channels: [channel("ch_aiko_li", "Aiko Tanaka", "linkedin", "Asia/Tokyo")],
  },
  {
    id: "mock_ravi",
    name: "Ravi Kumar",
    city: "Bengaluru",
    channels: [
      channel("ch_ravi_x", "ravi_builds", "twitter", "Asia/Kolkata"),
      channel(
        "ch_ravi_bsky",
        "ravi.bsky.social",
        "bluesky",
        "Asia/Kolkata",
        "isQueuePaused",
      ),
    ],
  },
  {
    id: "mock_zsofia",
    name: "Zsófia Kiss",
    city: "Budapest",
    channels: [
      channel("ch_zsofia_li", "Zsófia Kiss", "linkedin", "Europe/Budapest"),
      channel(
        "ch_zsofia_bsky",
        "zsofi.bsky.social",
        "bluesky",
        "Europe/Budapest",
      ),
    ],
  },
  {
    id: "mock_mark",
    name: "Márk Varga",
    city: "Budapest",
    channels: [
      channel("ch_mark_li", "Márk Varga", "linkedin", "Europe/Budapest"),
    ],
  },
  {
    id: "mock_sam",
    name: "Sam Walker",
    city: "London",
    channels: [
      channel("ch_sam_li", "Sam Walker", "linkedin", "Europe/London"),
      channel("ch_sam_pin", "samwalker", "pinterest", "Europe/London"),
    ],
  },
  {
    id: "mock_dana",
    name: "Dana Rossi",
    city: "New York",
    channels: [
      channel("ch_dana_li", "Dana Rossi", "linkedin", "America/New_York"),
      channel(
        "ch_dana_x",
        "danarossi",
        "twitter",
        "America/New_York",
        "isDisconnected",
      ),
    ],
  },
  {
    id: "mock_maya",
    name: "Maya Lee",
    city: "San Francisco",
    channels: [
      channel(
        "ch_maya_bsky",
        "mayalee.bsky.social",
        "bluesky",
        "America/Los_Angeles",
      ),
      channel(
        "ch_maya_threads",
        "maya.lee",
        "threads",
        "America/Los_Angeles",
        "isLocked",
      ),
    ],
  },
];

export function mockTokens(personId: string): Tokens {
  return {
    accessToken: personId,
    refreshToken: `${personId}.${randomBytes(8).toString("hex")}`,
    expiresAt: Date.now() + 60 * 60_000,
  };
}

// Posts the mock "scheduled", so a delete can be checked against them. Gone when the server restarts.
export const scheduled = new Map<
  string,
  {
    id: string;
    dueAt: string;
    owner: string;
    channelId: string;
    draft: boolean;
    assets: MockAsset[];
  }
>();

type MockAsset = { image: { url: string; metadata?: { altText?: string } } };

// The posts `npm run mock-data` puts in the database: the id says whose it is and when it goes out, so
// they still answer after a restart.
export function seededPostId(personId: string, dueAt: Date): string {
  return `mockseed.${personId}.${dueAt.getTime()}`;
}

function findScheduled(id: string) {
  const known = scheduled.get(id);
  if (known) return known;
  const [prefix, owner, due] = id.split(".");
  if (prefix !== "mockseed" || !owner || !Number(due)) return undefined;
  return {
    id,
    dueAt: new Date(Number(due)).toISOString(),
    owner,
    channelId: "",
    draft: false,
    assets: [],
  };
}

// A post on this channel fails when it's due, so a failed post can be tried on the wall.
const FAILING_CHANNEL = "ch_zsofia_bsky";

// Like Buffer: a refresh token works once.
const spent = new Set<string>();

export function mockRefresh(refreshToken: string): Tokens {
  if (spent.has(refreshToken)) {
    throw new TokenError(
      "Buffer token request failed: refresh token used twice (mock)",
      "invalid_grant",
    );
  }
  spent.add(refreshToken);
  return mockTokens(refreshToken.split(".")[0]);
}

export function mockGraphql(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): unknown {
  const person = PEOPLE.find((p) => p.id === accessToken);
  if (!person) throw new Error("Buffer API error: UNAUTHORIZED (mock)");

  const operation = /^(?:query|mutation) (\w+)/.exec(query)?.[1];
  // One organization per person, named after them, like a new Buffer account.
  const organizationId = `org_${person.id}`;
  if (operation === "Account") {
    return {
      account: {
        id: person.id,
        name: person.name,
        organizations: [{ id: organizationId }],
      } satisfies Account,
    };
  }
  if (operation === "Channels") {
    const input = variables?.input as { organizationId?: string } | undefined;
    if (input?.organizationId !== organizationId) {
      throw new Error("Buffer API error: FORBIDDEN (mock)");
    }
    return { channels: person.channels };
  }
  if (operation === "CreatePost") {
    const input = variables?.input as {
      channelId: string;
      text: string;
      dueAt: string;
      saveToDraft?: boolean;
      assets: MockAsset[];
    };
    if (!person.channels.some((c) => c.id === input.channelId)) {
      return { createPost: { message: "Channel not found" } };
    }
    if (!input.text.trim())
      return { createPost: { message: "Text is required" } };
    // Like Buffer: alt text is required once there is metadata.
    if (
      input.assets.some(
        (asset) => !asset.image?.url || !asset.image.metadata?.altText,
      )
    ) {
      return { createPost: { message: "Image url and altText are required" } };
    }
    const post = {
      id: `mockpost_${randomBytes(6).toString("hex")}`,
      dueAt: input.dueAt,
    };
    scheduled.set(post.id, {
      ...post,
      owner: person.id,
      channelId: input.channelId,
      draft: Boolean(input.saveToDraft),
      assets: input.assets,
    });
    const status = input.saveToDraft ? "draft" : "scheduled";
    return { createPost: { post: { ...post, status } } };
  }
  if (operation === "DeletePost") {
    const { id } = (variables?.input ?? {}) as { id?: string };
    if (!id || findScheduled(id)?.owner !== person.id) {
      return { deletePost: { message: "Post not found" } };
    }
    scheduled.delete(id);
    return { deletePost: { id } };
  }
  if (operation === "PostStatus") {
    const { id = "" } = (variables?.input ?? {}) as { id?: string };
    const known = findScheduled(id);
    if (known && known.owner !== person.id) {
      throw new Error("Buffer API error: FORBIDDEN (mock)");
    }
    // Like Buffer, a draft stays a draft.
    if (known?.draft) {
      return {
        post: {
          status: "draft",
          dueAt: known.dueAt,
          externalLink: null,
          error: null,
        },
      } satisfies { post: BufferPost };
    }
    // Like Buffer after the person deleted it. A post from before a restart is unknown too.
    if (!known)
      throw new BufferApiError("NOT_FOUND", `Post not found for id: ${id}`);
    if (Date.parse(known.dueAt) > Date.now()) {
      return {
        post: {
          status: "scheduled",
          dueAt: known.dueAt,
          externalLink: null,
          error: null,
        },
      } satisfies { post: BufferPost };
    }
    if (known.channelId === FAILING_CHANNEL) {
      return {
        post: {
          status: "error",
          dueAt: known.dueAt,
          externalLink: null,
          error: { message: "Bluesky didn't accept the post (mock)" },
        },
      } satisfies { post: BufferPost };
    }
    return {
      post: {
        status: "sent",
        dueAt: known.dueAt,
        externalLink: `https://example.com/mock/${id}`,
        error: null,
      },
    } satisfies { post: BufferPost };
  }
  throw new Error(`Mock mode has no answer for ${operation ?? "this query"}`);
}
