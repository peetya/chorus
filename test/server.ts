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
