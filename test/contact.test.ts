import assert from "node:assert/strict";
import { test } from "node:test";
import { db } from "../src/db.ts";
import { listen, useTestDb } from "./server.ts";

useTestDb();

function send(base: string, fields: Record<string, string>) {
  return fetch(`${base}/contact`, {
    method: "POST",
    body: new URLSearchParams(fields),
  });
}

async function saved() {
  return db().collection("messages").find().toArray();
}

test("a message is saved with the email to answer it", async (t) => {
  const base = await listen(t);
  const res = await send(base, {
    email: "lena@example.com",
    text: "Can I run a Chorus for our meetup?",
  });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /your message is in/);
  const [message] = await saved();
  assert.equal(message.email, "lena@example.com");
  assert.equal(message.text, "Can I run a Chorus for our meetup?");
});

test("a message without an email comes back with what was typed", async (t) => {
  const base = await listen(t);
  const res = await send(base, { email: "lena", text: "Hello <there>" });
  assert.equal(res.status, 400);
  const page = await res.text();
  assert.match(page, /Add your email/);
  assert.match(page, /Hello &lt;there&gt;<\/textarea>/);
});

test("a bot that fills in the hidden field is thanked and ignored", async (t) => {
  const base = await listen(t);
  await db().collection("messages").deleteMany({});
  const res = await send(base, {
    email: "bot@example.com",
    text: "Buy now",
    website: "https://spam.example",
  });
  assert.match(await res.text(), /your message is in/);
  assert.equal((await saved()).length, 0);
});

test("at most 50 messages a day", async (t) => {
  const base = await listen(t);
  const messages = db().collection("messages");
  await messages.deleteMany({});
  await messages.insertMany(
    Array.from({ length: 50 }, () => ({
      email: "a@example.com",
      text: "Hi",
      createdAt: new Date(),
    })),
  );
  const res = await send(base, { email: "lena@example.com", text: "Hi" });
  assert.equal(res.status, 429);
  assert.equal((await saved()).length, 50);
});
