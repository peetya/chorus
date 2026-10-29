import assert from "node:assert/strict";
import { test } from "node:test";
import { closeDb, db } from "../src/db.ts";

test("a MONGODB_URI without a database name is refused", async (t) => {
  process.env.MONGODB_URI = "mongodb://localhost:27017/?retryWrites=true";
  t.after(closeDb);
  assert.throws(() => db(), /no database name/);
});
