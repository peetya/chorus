import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { TestContext } from "node:test";
import app from "../src/app.ts";

// Starts the app on a free port for one test and stops it afterwards.
export async function listen(t: TestContext): Promise<string> {
  const server = app.listen(0);
  t.after(() => server.close());
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return `http://localhost:${port}`;
}

// The name=value part of a Set-Cookie header, ready to send back.
export function cookieFrom(res: Response, name: string): string {
  const header = res.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${name}=`));
  assert.ok(header, `no ${name} cookie`);
  return header;
}
