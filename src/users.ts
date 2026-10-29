import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import {
  type Account,
  refreshTokens,
  TokenError,
  type Tokens,
} from "./buffer.ts";
import { secretEnv } from "./config.ts";
import { seal, unseal } from "./crypto.ts";
import { db } from "./db.ts";

export type User = {
  _id: string; // our own id, so other collections don't depend on Buffer's
  provider: "buffer";
  providerAccountId: string;
  name: string;
  tokenEnc?: string; // access and refresh token, sealed with TOKEN_KEY
  tokenExpiresAt?: Date;
  refreshingUntil?: Date; // the lease while one request refreshes the token
};

type StoredTokens = { accessToken: string; refreshToken: string };

const LEASE_MS = 30_000;
const WAIT_MS = 500;
const WAIT_TRIES = 20;

let indexes: Promise<unknown> | undefined;

export async function users() {
  const collection = db().collection<User>("users");
  indexes ??= collection
    .createIndex({ provider: 1, providerAccountId: 1 }, { unique: true })
    .catch((err) => {
      indexes = undefined;
      throw err;
    });
  await indexes;
  return collection;
}

function sealTokens(tokens: Tokens) {
  const stored: StoredTokens = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
  return {
    tokenEnc: seal(stored, secretEnv("TOKEN_KEY")),
    tokenExpiresAt: new Date(tokens.expiresAt),
  };
}

// Signing in again with the same Buffer account finds the same user and replaces the tokens.
export async function saveUser(
  account: Account,
  tokens: Tokens,
): Promise<string> {
  const user = await (await users()).findOneAndUpdate(
    { provider: "buffer", providerAccountId: account.id },
    {
      $set: { name: account.name, ...sealTokens(tokens) },
      $unset: { refreshingUntil: "" },
      $setOnInsert: { _id: randomUUID() },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!user) throw new Error("The user wasn't saved");
  return user._id;
}

// Every Buffer call gets its token here. Buffer's refresh tokens work once, and a reused one revokes the
// person's whole grant. So one request refreshes under a short lease, and the others wait for its result.
export async function getAccessToken(userId: string): Promise<string> {
  const collection = await users();
  for (let tries = 0; tries < WAIT_TRIES; tries++) {
    const user = await collection.findOne({ _id: userId });
    const stored =
      user?.tokenEnc &&
      unseal<StoredTokens>(user.tokenEnc, secretEnv("TOKEN_KEY"));
    if (!user?.tokenEnc || !stored) {
      throw new Error("Not connected to Buffer: sign in again");
    }
    if (user.tokenExpiresAt && user.tokenExpiresAt > new Date()) {
      return stored.accessToken;
    }

    // Only if the token is still the one we read: if another request already refreshed it, read again.
    const now = new Date();
    const leased = await collection.findOneAndUpdate(
      {
        _id: userId,
        tokenEnc: user.tokenEnc,
        $or: [
          { refreshingUntil: { $exists: false } },
          { refreshingUntil: { $lt: now } },
        ],
      },
      { $set: { refreshingUntil: new Date(now.getTime() + LEASE_MS) } },
    );
    if (leased) return refresh(userId, stored.refreshToken);
    await setTimeout(WAIT_MS);
  }
  throw new Error("Buffer sign-in is still being renewed: try again soon");
}

async function refresh(userId: string, refreshToken: string): Promise<string> {
  const collection = await users();
  let tokens: Tokens;
  try {
    tokens = await refreshTokens(refreshToken);
  } catch (err) {
    // A refused refresh token won't work again, so drop it and the person signs in again. After any
    // other failure the lease stays until it runs out, so the next try waits 30 seconds.
    if (err instanceof TokenError && err.code === "invalid_grant") {
      await collection.updateOne(
        { _id: userId },
        { $unset: { tokenEnc: "", tokenExpiresAt: "", refreshingUntil: "" } },
      );
    }
    throw err;
  }
  await collection.updateOne(
    { _id: userId },
    { $set: sealTokens(tokens), $unset: { refreshingUntil: "" } },
  );
  return tokens.accessToken;
}
