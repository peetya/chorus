import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { closeDb, collection, db } from "../src/db.ts";

test("a MONGODB_URI without a database name is refused", async (t) => {
  process.env.MONGODB_URI = "mongodb://localhost:27017/?retryWrites=true";
  t.after(closeDb);
  assert.throws(() => db(), /no database name/);
});

test("after a failed first connect, the next request connects again", async (t) => {
  t.after(closeDb);
  // Nothing listens on port 1, like Atlas refusing an IP that isn't on its list.
  process.env.MONGODB_URI =
    "mongodb://127.0.0.1:1/chorus-test-down?serverSelectionTimeoutMS=300";
  await assert.rejects(collection("tries", [{ key: { at: 1 } }]));

  process.env.MONGODB_URI = `mongodb://localhost:27017/chorus-test-${randomBytes(4).toString("hex")}`;
  const tries = await collection("tries", [{ key: { at: 1 } }]);
  await tries.insertOne({ at: new Date() });
  assert.equal(await tries.countDocuments(), 1);
  await db().dropDatabase();
});
