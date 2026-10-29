import { type Db, MongoClient } from "mongodb";
import { env } from "./config.ts";

// One client per process. Vercel reuses warm functions, and a client per request would soon use up
// the 500 connections of a free Atlas cluster.
let client: MongoClient | undefined;

// The database name comes from MONGODB_URI, so production and previews can use different ones.
// Without one the driver quietly uses "test", so we refuse instead.
export function db(): Db {
  client ??= new MongoClient(env("MONGODB_URI"));
  const database = client.db();
  if (database.databaseName === "test") {
    throw new Error(
      "MONGODB_URI has no database name: add it before the ?, like .../chorus?retryWrites=true",
    );
  }
  return database;
}

export async function closeDb() {
  await client?.close();
  client = undefined;
}
