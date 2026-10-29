import assert from "node:assert/strict";
import { test } from "node:test";
import { cookieFrom, listen } from "./server.ts";

process.env.BUFFER_MOCK = "1";
process.env.SESSION_SECRET = "a".repeat(32);

function signInAs(base: string, person: string) {
  return fetch(`${base}/login/mock`, {
    method: "POST",
    body: new URLSearchParams({ person }),
    redirect: "manual",
  });
}

test("login lists the fake people instead of going to Buffer", async (t) => {
  const base = await listen(t);
  const res = await fetch(`${base}/login`, { redirect: "manual" });

  assert.equal(res.status, 200);
  assert.match(await res.text(), /Aiko Tanaka, Tokyo/);
});

test("signing in as a fake person opens their page", async (t) => {
  const base = await listen(t);
  const login = await signInAs(base, "mock_aiko");
  assert.equal(login.status, 302);
  assert.equal(login.headers.get("location"), "/me");

  const cookie = cookieFrom(login, "chorus_session").split(";")[0];
  const me = await fetch(`${base}/me`, { headers: { cookie } });
  const text = await me.text();
  assert.match(text, /Hi Aiko Tanaka/);
  assert.match(text, /mock mode/);
});

test("someone not on the list can't sign in", async (t) => {
  const base = await listen(t);
  const res = await signInAs(base, "mock_nobody");
  assert.equal(res.status, 400);
});

test("mock mode refuses to run in production", async (t) => {
  process.env.VERCEL_ENV = "production";
  t.after(() => delete process.env.VERCEL_ENV);
  const base = await listen(t);
  const res = await fetch(`${base}/login`);
  assert.equal(res.status, 500);
});
