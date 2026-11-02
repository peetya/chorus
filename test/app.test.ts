import assert from "node:assert/strict";
import { test } from "node:test";
import { listen } from "./server.ts";

test("health check answers ok", async (t) => {
  const base = await listen(t);
  const res = await fetch(`${base}/health`);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("pages refuse scripts from anywhere else and don't name the framework", async (t) => {
  const base = await listen(t);
  const res = await fetch(`${base}/`);

  assert.match(
    res.headers.get("content-security-policy") ?? "",
    /script-src 'self';/,
  );
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-powered-by"), null);
});

test("a form posted from another site is refused", async (t) => {
  const base = await listen(t);
  const logout = (origin: string) =>
    fetch(`${base}/logout`, {
      method: "POST",
      headers: { origin },
      redirect: "manual",
    });

  assert.equal((await logout("https://evil.example")).status, 403);
  assert.equal((await logout("null")).status, 403);
  assert.notEqual((await logout(base)).status, 403);
});

test("the privacy page is public, and the sign-in page links to it", async (t) => {
  const base = await listen(t);
  const privacy = await fetch(`${base}/privacy`);
  assert.equal(privacy.status, 200);
  assert.match(await privacy.text(), /No analytics, no ads, no tracking/);
  const login = await (await fetch(`${base}/login`)).text();
  assert.match(login, /href="\/privacy"/);
});

test("pages load their fonts from Chorus, not from Google", async (t) => {
  const base = await listen(t);
  for (const path of ["/", "/login", "/privacy"]) {
    const page = await (await fetch(`${base}${path}`)).text();
    assert.doesNotMatch(page, /googleapis|gstatic/);
    assert.match(page, /href="\/fonts\/instrument-sans-latin\.woff2"/);
  }
});
