// Mock mode (BUFFER_MOCK=1): fake people and fake Buffer answers, so Chorus runs without a Buffer account.
// The answers have the same shape as Buffer's. Each new Buffer call adds its answer here.
import { randomBytes } from "node:crypto";
import { type Account, TokenError, type Tokens } from "./buffer.ts";

// A spread of time zones, so a wave can be tried around the world. The id is also the access token.
export const PEOPLE = [
  { id: "mock_aiko", name: "Aiko Tanaka", city: "Tokyo" },
  { id: "mock_ravi", name: "Ravi Kumar", city: "Bengaluru" },
  { id: "mock_zsofia", name: "Zsófia Kiss", city: "Budapest" },
  { id: "mock_sam", name: "Sam Walker", city: "London" },
  { id: "mock_dana", name: "Dana Rossi", city: "New York" },
  { id: "mock_maya", name: "Maya Lee", city: "San Francisco" },
];

export function mockTokens(personId: string): Tokens {
  return {
    accessToken: personId,
    refreshToken: `${personId}.${randomBytes(8).toString("hex")}`,
    expiresAt: Date.now() + 60 * 60_000,
  };
}

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

export function mockGraphql(accessToken: string, query: string): unknown {
  const person = PEOPLE.find((p) => p.id === accessToken);
  if (!person) throw new Error("Buffer API error: UNAUTHORIZED (mock)");

  const operation = /^(?:query|mutation) (\w+)/.exec(query)?.[1];
  if (operation === "Account") {
    return { account: { id: person.id, name: person.name } satisfies Account };
  }
  throw new Error(`Mock mode has no answer for ${operation ?? "this query"}`);
}
