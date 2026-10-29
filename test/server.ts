import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, type TestContext } from "node:test";
import app from "../src/app.ts";
import { closeDb, db } from "../src/db.ts";

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

// Gives this test file its own database and drops it at the end. Needs MongoDB on localhost (npm run db).
export function useTestDb() {
  process.env.MONGODB_URI = `mongodb://localhost:27017/chorus-test-${randomBytes(4).toString("hex")}`;
  after(async () => {
    await db().dropDatabase();
    await closeDb();
  });
}

// Signs in as one of mock mode's fake people and returns the session cookie to send.
export async function mockSession(base: string, person: string) {
  const res = await fetch(`${base}/login/mock`, {
    method: "POST",
    body: new URLSearchParams({ person }),
    redirect: "manual",
  });
  return cookieFrom(res, "chorus_session").split(";")[0];
}
