import assert from "node:assert/strict";
import { test } from "node:test";
import { mockRefresh, mockTokens } from "../src/mock.ts";
import { getAccessToken, saveUser, users } from "../src/users.ts";
import { useTestDb } from "./server.ts";

process.env.BUFFER_MOCK = "1";
process.env.TOKEN_KEY = "b".repeat(32);
useTestDb();

function expired(personId: string) {
  return { ...mockTokens(personId), expiresAt: Date.now() - 1000 };
}

test("tokens are stored encrypted", async () => {
  const tokens = mockTokens("mock_aiko");
  const userId = await saveUser({ id: "mock_aiko", name: "Aiko" }, tokens);

  const raw = JSON.stringify(await (await users()).findOne({ _id: userId }));
  assert.ok(!raw.includes(tokens.refreshToken));
  assert.equal(await getAccessToken(userId), "mock_aiko");
});

test("signing in again keeps the same user", async () => {
  const account = { id: "mock_sam", name: "Sam" };
  const first = await saveUser(account, mockTokens("mock_sam"));
  const second = await saveUser(account, mockTokens("mock_sam"));
  assert.equal(first, second);
});

// The mock refuses a refresh token used twice, so a second refresh would fail this test.
test("eight requests with an expired token refresh it once", async () => {
  const userId = await saveUser(
    { id: "mock_ravi", name: "Ravi" },
    expired("mock_ravi"),
  );

  const tokens = await Promise.all(
    Array.from({ length: 8 }, () => getAccessToken(userId)),
  );
  assert.deepEqual(new Set(tokens), new Set(["mock_ravi"]));

  const user = await (await users()).findOne({ _id: userId });
  assert.ok(user?.tokenExpiresAt && user.tokenExpiresAt > new Date());
  assert.equal(user?.refreshingUntil, undefined);
});

test("a refused refresh token means signing in again", async () => {
  const tokens = expired("mock_dana");
  mockRefresh(tokens.refreshToken);
  const userId = await saveUser({ id: "mock_dana", name: "Dana" }, tokens);

  await assert.rejects(getAccessToken(userId), /used twice/);
  await assert.rejects(getAccessToken(userId), /sign in again/);
});
