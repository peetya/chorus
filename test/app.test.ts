import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import app from "../src/app.ts";

test("health check answers ok", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  await once(server, "listening");

  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://localhost:${port}/health`);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});
