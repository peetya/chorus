import {
  type Db,
  type Document,
  type IndexDescription,
  MongoClient,
} from "mongodb";
import { env } from "./config.ts";

// One client per process. Vercel reuses warm functions, and a client per request would soon use up
// the 500 connections of a free Atlas cluster.
let client: MongoClient | undefined;
let connecting: Promise<MongoClient> | undefined;

function mongo(): MongoClient {
  // ignoreUndefined: an empty optional field is left out, not stored as null.
  client ??= new MongoClient(env("MONGODB_URI"), { ignoreUndefined: true });
  return client;
}

// After a failed first connect the driver closes the client for good, and every later call only says
// "Topology is closed". So a failed connect drops the client, and the next request starts a new one.
function connect(): Promise<MongoClient> {
  const current = mongo();
  connecting ??= current.connect().catch(async (err) => {
    connecting = undefined;
    if (client === current) client = undefined;
    await current.close().catch(() => {});
    throw err;
  });
  return connecting;
}

// The database name comes from MONGODB_URI, so production and previews can use different ones.
// Without one the driver quietly uses "test", so we refuse instead.
export function db(): Db {
  const database = mongo().db();
  if (database.databaseName === "test") {
    throw new Error(
      "MONGODB_URI has no database name: add it before the ?, like .../chorus?retryWrites=true",
    );
  }
  return database;
}

const indexes = new Map<string, Promise<unknown>>();

// A collection with its indexes, created once per process. A failed attempt is tried again next time.
export async function collection<T extends Document>(
  name: string,
  wanted: IndexDescription[],
) {
  const found = db().collection<T>(name);
  await connect();
  let ready = indexes.get(name);
  if (!ready) {
    ready = found.createIndexes(wanted).catch((err) => {
      indexes.delete(name);
      throw err;
    });
    indexes.set(name, ready);
  }
  await ready;
  return found;
}

export async function closeDb() {
  await client?.close();
  client = undefined;
  connecting = undefined;
}
