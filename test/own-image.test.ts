import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, test } from "node:test";
import sharp from "sharp";
import { addDays, choruses } from "../src/choruses.ts";
import { dailyCleanup, deleteUserData } from "../src/cleanup.ts";
import { deleteImages, images, ownImageOf } from "../src/images.ts";
import { scheduled } from "../src/mock.ts";
import { posts } from "../src/posts.ts";
import { users } from "../src/users.ts";
import {
  finishOpenChoruses,
  listen,
  mockSession,
  useTestDb,
} from "./server.ts";

process.env.BUFFER_MOCK = "1";
process.env.SESSION_SECRET = "a".repeat(32);
process.env.TOKEN_KEY = "b".repeat(32);
delete process.env.BLOB_STORE_ID;
delete process.env.BLOB_READ_WRITE_TOKEN;
// The files land in public/uploads, so they go at the end, before useTestDb drops the database.
after(() => deleteImages({}));
useTestDb();

function post(
  base: string,
  path: string,
  cookie: string,
  fields: string[][] = [],
) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { cookie },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });
}

// The editor's whole form, sent by its "Add image" button.
function addOwn(
  base: string,
  path: string,
  cookie: string,
  fields: { text: string; alt: string; file?: Buffer },
) {
  const form = new FormData();
  form.set("text", fields.text);
  form.set("alt", fields.alt);
  form.set(
    "file",
    new Blob([new Uint8Array(fields.file ?? Buffer.alloc(0))]),
    "screenshot.png",
  );
  return fetch(`${base}${path}/post/image`, {
    method: "POST",
    headers: { cookie },
    body: form,
    redirect: "manual",
  });
}

function picture(width = 1200, height = 1200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: "#2266aa" },
  })
    .png()
    .toBuffer();
}

// A Chorus without images of its own, and Aiko joined with LinkedIn.
async function joined(base: string) {
  await finishOpenChoruses();
  const owner = await mockSession(base, "mock_zsofia");
  const created = await post(base, "/new", owner, [
    ["title", "Buffer Commit: what we built"],
    ["facts", "Buffer Commit is Buffer's first build contest."],
    ["hashtags", "#BufferCommit"],
    ["questions", "What did you build?"],
    ["day", addDays(14)],
    ["localTime", "09:00"],
  ]);
  const path = created.headers.get("location") ?? "";
  const aiko = await mockSession(base, "mock_aiko");
  await post(base, `${path}/join`, aiko, [["channelId", "ch_aiko_li"]]);
  return { path, owner, aiko };
}

async function postOf(path: string) {
  const found = await (await posts()).findOne({
    chorusId: path.slice(3),
    channelId: "ch_aiko_li",
  });
  assert.ok(found);
  return found;
}

const editor = async (base: string, path: string, cookie: string, query = "") =>
  (await fetch(`${base}${path}/post${query}`, { headers: { cookie } })).text();

test("a person adds their own image in the editor, and it goes to Buffer with their post", async (t) => {
  const base = await listen(t);
  const { path, aiko } = await joined(base);
  assert.match(
    await editor(base, path, aiko),
    /Add your own image if you like/,
  );

  const res = await addOwn(base, path, aiko, {
    text: "We built Tally. #BufferCommit",
    alt: "The Tally dashboard",
    file: await picture(),
  });
  assert.equal(res.headers.get("location"), `${path}/post?saved=1`);
  const saved = await postOf(path);
  assert.equal(saved.text, "We built Tally. #BufferCommit");
  assert.equal(saved.imageIndex, "own");
  const own = await ownImageOf(saved._id);
  assert.equal(own?.alt, "The Tally dashboard");

  const page = await editor(base, path, aiko);
  assert.match(page, /value="own" checked/);
  // It's Aiko's, not one of the Chorus's images that others get.
  assert.doesNotMatch(page, /added an image/);
  assert.match(page, /Your own image\. LinkedIn gets the whole image\./);
  assert.match(page, /Remove your image/);
  const review = await (
    await fetch(`${base}${path}/post/review`, { headers: { cookie: aiko } })
  ).text();
  assert.ok(review.includes(own?.urls.original ?? "?"));

  await post(base, `${path}/post/approve`, aiko);
  const sent = await postOf(path);
  assert.deepEqual(scheduled.get(sent.bufferPostId ?? "")?.assets, [
    {
      image: {
        url: own?.urls.original,
        metadata: { altText: "The Tally dashboard" },
      },
    },
  ]);
  // Scheduled: the image can't change here anymore.
  const late = await addOwn(base, path, aiko, {
    text: "Changed",
    alt: "Another",
    file: await picture(),
  });
  assert.equal(late.headers.get("location"), path);
  assert.equal((await ownImageOf(sent._id))?.id, own?.id);
});

test("a problem with the image keeps the text and says what's wrong", async (t) => {
  const base = await listen(t);
  const { path, aiko } = await joined(base);
  const cases: [Partial<{ alt: string; file: Buffer }>, string, RegExp][] = [
    [{ alt: "A screenshot" }, "file", /Pick an image file first/],
    [{ alt: "", file: await picture() }, "alt", /Describe your image/],
    [
      { alt: "A screenshot", file: Buffer.from("not an image") },
      "type",
      /isn&#39;t a JPEG, PNG or WebP/,
    ],
  ];
  for (const [fields, code, message] of cases) {
    const res = await addOwn(base, path, aiko, {
      text: `Draft for ${code}`,
      alt: fields.alt ?? "",
      file: fields.file,
    });
    assert.equal(res.headers.get("location"), `${path}/post?image=${code}`);
    assert.equal((await postOf(path)).text, `Draft for ${code}`);
    assert.match(await editor(base, path, aiko, `?image=${code}`), message);
  }
  const { _id } = await postOf(path);
  assert.equal(await (await images()).countDocuments({ postId: _id }), 0);
  // Only known codes become a message.
  assert.doesNotMatch(
    await editor(base, path, aiko, "?image=<b>hi</b>"),
    /<b>hi<\/b>/,
  );
});

test("a new own image replaces the old one, and removing it deletes the files", async (t) => {
  const base = await listen(t);
  const { path, aiko } = await joined(base);
  await addOwn(base, path, aiko, {
    text: "First. #BufferCommit",
    alt: "First",
    file: await picture(),
  });
  const { _id } = await postOf(path);
  const first = await ownImageOf(_id);
  await addOwn(base, path, aiko, {
    text: "Second. #BufferCommit",
    alt: "Second",
    file: await picture(1600, 900),
  });
  const second = await ownImageOf(_id);
  assert.equal(second?.alt, "Second");
  assert.equal(await (await images()).countDocuments({ postId: _id }), 1);
  assert.ok(!existsSync(`public${first?.urls.original}`));

  // Picking "No image" keeps the file, so they can pick it again.
  await post(base, `${path}/post`, aiko, [
    ["text", "Second. #BufferCommit"],
    ["image", "none"],
  ]);
  assert.equal((await postOf(path)).imageIndex, null);
  assert.ok(await ownImageOf(_id));

  await post(base, `${path}/post/image/remove`, aiko, [
    ["text", "Kept text. #BufferCommit"],
  ]);
  assert.equal(await ownImageOf(_id), null);
  assert.ok(!existsSync(`public${second?.urls.original}`));
  const after = await postOf(path);
  assert.equal(after.text, "Kept text. #BufferCommit");
  assert.equal(after.imageIndex, null);
  // "own" without an image to go with it isn't accepted.
  await post(base, `${path}/post`, aiko, [
    ["text", "Kept text. #BufferCommit"],
    ["image", "own"],
  ]);
  assert.equal((await postOf(path)).imageIndex, null);
});

test("own images go with the person, with the organizer's Chorus, and in the cleanup", async (t) => {
  const base = await listen(t);
  const { path, aiko } = await joined(base);
  await addOwn(base, path, aiko, {
    text: "Mine. #BufferCommit",
    alt: "Mine",
    file: await picture(),
  });
  const { _id } = await postOf(path);
  const own = await ownImageOf(_id);
  // The organizer deletes their data: the Chorus goes, and Aiko's image in it too.
  const zsofia = await (await users()).findOne({
    providerAccountId: "mock_zsofia",
  });
  await deleteUserData(zsofia?._id ?? "");
  assert.equal(await ownImageOf(_id), null);
  assert.ok(!existsSync(`public${own?.urls.original}`));

  // In a Chorus that is over and has nothing left to send, the daily cleanup takes it.
  const next = await joined(base);
  await addOwn(base, next.path, next.aiko, {
    text: "Mine. #BufferCommit",
    alt: "Mine",
    file: await picture(),
  });
  const later = await postOf(next.path);
  await (await choruses()).updateOne(
    { _id: next.path.slice(3) },
    { $set: { day: addDays(-3) } },
  );
  const removed = await dailyCleanup();
  assert.equal(removed.images, 1);
  assert.equal(await ownImageOf(later._id), null);
});
