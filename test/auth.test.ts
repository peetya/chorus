import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { type TestContext, test } from "node:test";
import { authorizeUrl, createPkce, exchangeCode } from "../src/buffer.ts";
import { seal, unseal } from "../src/crypto.ts";
import { cookieFrom, listen } from "./server.ts";

process.env.BUFFER_CLIENT_ID = "test-client";
process.env.BUFFER_CLIENT_SECRET = "test-secret";
process.env.BUFFER_REDIRECT_URI = "https://localhost:3000/callback";
process.env.SESSION_SECRET = "a".repeat(32);

test("a sealed value opens only with the same secret and unchanged", () => {
  const sealed = seal({ name: "Lena" }, "secret-one");
  assert.deepEqual(unseal(sealed, "secret-one"), { name: "Lena" });
  assert.equal(unseal(sealed, "secret-two"), null);

  const changed = Buffer.from(sealed, "base64url");
  changed[changed.length - 1] ^= 1;
  assert.equal(unseal(changed.toString("base64url"), "secret-one"), null);
});

test("the PKCE challenge is the SHA-256 of the verifier", () => {
  const { verifier, challenge } = createPkce();
  assert.equal(
    challenge,
    createHash("sha256").update(verifier).digest("base64url"),
  );
});

test("the authorize URL asks for a refresh token with S256 PKCE", () => {
  const url = new URL(authorizeUrl("the-state", "the-challenge"));
  assert.equal(url.origin, "https://auth.buffer.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "the-state");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://localhost:3000/callback",
  );
  assert.ok(
    url.searchParams.get("scope")?.split(" ").includes("offline_access"),
  );
});

// Buffer's token endpoint, answering with this body and status.
function tokenAnswer(t: TestContext, body: unknown, status = 200) {
  const sent: URLSearchParams[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      sent.push(new URLSearchParams(String(init.body)));
      return new Response(JSON.stringify(body), { status });
    },
  );
  return sent;
}

test("the code is exchanged with the verifier and the secret in the body", async (t) => {
  const sent = tokenAnswer(t, {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
  });
  const tokens = await exchangeCode("the-code", "the-verifier");
  assert.equal(tokens.accessToken, "access");
  assert.equal(tokens.refreshToken, "refresh");
  assert.ok(tokens.expiresAt < Date.now() + 3600_000);
  assert.equal(sent[0].get("code_verifier"), "the-verifier");
  assert.equal(sent[0].get("client_secret"), "test-secret");
});

test("a refused code says what to check", async (t) => {
  tokenAnswer(t, { error: "invalid_grant", error_description: "Expired" }, 400);
  await assert.rejects(exchangeCode("old", "v"), {
    name: "Error",
    code: "invalid_grant",
    message: /Expired \(the code was used or expired/,
  });
});

test("tokens without a refresh token are refused", async (t) => {
  tokenAnswer(t, { access_token: "access" });
  await assert.rejects(exchangeCode("code", "v"), /no refresh token/);
});

test("an expired session cookie is no session", async (t) => {
  const base = await listen(t);
  const value = { userId: "u1", name: "Lena" };
  const home = async (exp: number) => {
    const sealed = seal({ value, exp }, process.env.SESSION_SECRET ?? "");
    const res = await fetch(`${base}/`, {
      headers: { cookie: `chorus_session=${sealed}` },
    });
    return res.text();
  };

  assert.match(await home(Date.now() + 60_000), /Menu for Lena/);
  assert.doesNotMatch(await home(Date.now() - 1000), /Menu for Lena/);
});

test("the sign-in page lists Buffer and keeps where to go next", async (t) => {
  const base = await listen(t);
  const res = await fetch(`${base}/login?next=/account`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /href="\/login\/buffer\?next=%2Faccount"/);
  assert.doesNotMatch(text, /href="\/login">Sign in/);
});

test("login sends the person to Buffer with a short-lived cookie", async (t) => {
  const base = await listen(t);
  const res = await fetch(`${base}/login/buffer`, { redirect: "manual" });

  assert.equal(res.status, 302);
  assert.ok(
    res.headers.get("location")?.startsWith("https://auth.buffer.com/"),
  );
  const cookie = cookieFrom(res, "chorus_oauth");
  assert.match(cookie, /Path=\/callback/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
});

test("a callback without a login cookie asks to sign in again", async (t) => {
  const base = await listen(t);
  const res = await fetch(`${base}/callback?code=abc&state=xyz`);
  assert.equal(res.status, 400);
});

test("a callback with the wrong state is refused", async (t) => {
  const base = await listen(t);
  const login = await fetch(`${base}/login/buffer`, { redirect: "manual" });
  const cookie = cookieFrom(login, "chorus_oauth").split(";")[0];

  const res = await fetch(`${base}/callback?code=abc&state=not-ours`, {
    headers: { cookie },
  });
  assert.equal(res.status, 403);
});

test("mock sign-in is off without BUFFER_MOCK", async (t) => {
  const base = await listen(t);
  const res = await fetch(`${base}/login/mock`, {
    method: "POST",
    body: new URLSearchParams({ person: "mock_aiko" }),
  });
  assert.equal(res.status, 404);
});

test("/me without a session asks to sign in", async (t) => {
  const base = await listen(t);
  const res = await fetch(`${base}/me`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/login");
});
