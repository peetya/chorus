import assert from "node:assert/strict";
import { test } from "node:test";
import { listen } from "./server.ts";

test("health check answers ok", async (t) => {
  const base = await listen(t);
  const res = await fetch(`${base}/health`);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});
