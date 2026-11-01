import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, test } from "node:test";
import sharp from "sharp";
import { addDays, choruses } from "../src/choruses.ts";
import { dailyCleanup, deleteUserData } from "../src/cleanup.ts";
import { cropBox, deleteImages, images, imagesIn } from "../src/images.ts";
import { scheduled } from "../src/mock.ts";
import { findPost, posts } from "../src/posts.ts";
import { readSaved } from "../src/storage.ts";
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
delete process.env.BLOB_READ_WRITE_TOKEN;
// The files land in public/uploads. This test file has its own database, so all its images go at the
// end, before useTestDb drops it.
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

// Uploads an image on "Start a Chorus", as new-images.js does.
function upload(base: string, cookie: string, data: Buffer) {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(data)]), "photo.png");
  return fetch(`${base}/images`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
}

const idOf = (card: string) => /data-image="([^"]+)"/.exec(card)?.[1] ?? "";

// Left half red, right half blue, so a crop shows which side it kept.
function halves(width = 2000, height = 500): Promise<Buffer> {
  const half = { width: width / 2, height, channels: 3 as const };
  return sharp({ create: { ...half, width, background: "#0000ff" } })
    .composite([
      {
        input: { create: { ...half, background: "#ff0000" } },
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
}

const BRIEF = () => [
  ["title", "Northwind ships Tally 2.0"],
  ["facts", "Tally 2.0 is out today."],
  ["hashtags", "#TallyLaunch"],
  ["questions", "What do you like most?"],
  ["day", addDays(14)],
  ["localTime", "09:00"],
];

// A Chorus with one image per description, added on the form like an organizer does.
async function startChorus(base: string, cookie: string, alts: string[] = []) {
  await finishOpenChoruses();
  const fields = BRIEF();
  for (const alt of alts) {
    const card = await (await upload(base, cookie, await halves())).text();
    fields.push([`alt-${idOf(card)}`, alt]);
  }
  const res = await post(base, "/new", cookie, fields);
  return res.headers.get("location") ?? "";
}

function imagesOf(path: string) {
  return imagesIn({ chorusId: path.slice(3) });
}

async function userIdOf(person: string) {
  return (
    (await (await users()).findOne({ providerAccountId: person }))?._id ?? ""
  );
}

async function size(url: string) {
  const { width, height } = await sharp(await readSaved(url)).metadata();
  return `${width}x${height}`;
}

async function redness(url: string) {
  const { channels } = await sharp(await readSaved(url)).stats();
  return channels[0].mean - channels[2].mean;
}

test("the crop box keeps the focus in view, inside the image", () => {
  assert.deepEqual(cropBox(2000, 1000, { x: 0.5, y: 0.5 }, 16 / 9), {
    left: 111,
    top: 0,
    width: 1778,
    height: 1000,
  });
  assert.equal(cropBox(2000, 1000, { x: 0, y: 0.5 }, 16 / 9).left, 0);
  assert.equal(cropBox(2000, 1000, { x: 1, y: 0.5 }, 16 / 9).left, 222);
  const tall = cropBox(1000, 2000, { x: 0.5, y: 0.1 }, 1.91);
  assert.equal(tall.top, 0);
  assert.equal(tall.width, 1000);
});

test("an upload is checked by its bytes and its size, and cropped for each network", async (t) => {
  const base = await listen(t);
  await finishOpenChoruses();
  const owner = await mockSession(base, "mock_zsofia");
  const picture = await halves();

  const text = await upload(base, owner, Buffer.from("not an image"));
  assert.equal(text.status, 400);
  assert.match(await text.text(), /isn't a JPEG, PNG or WebP image/);

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.equal((await upload(base, owner, svg)).status, 400);

  const big = Buffer.concat([picture, Buffer.alloc(4 * 1024 * 1024)]);
  const tooBig = await upload(base, owner, big);
  assert.equal(tooBig.status, 400);
  assert.match(await tooBig.text(), /over 4 MB/);
  const huge = await upload(base, owner, Buffer.alloc(5 * 1024 * 1024));
  assert.equal(huge.status, 413);
  assert.match(await huge.text(), /over 4 MB/);

  const signedOut = await upload(base, "", picture);
  assert.equal(signedOut.status, 401);

  // With real Buffer, a file on this computer is no use: Buffer couldn't fetch it.
  delete process.env.BUFFER_MOCK;
  const local = await upload(base, owner, picture);
  process.env.BUFFER_MOCK = "1";
  assert.equal(local.status, 400);
  assert.match(await local.text(), /BLOB_READ_WRITE_TOKEN/);

  const path = await startChorus(base, owner, [
    "Four people smiling on a video call",
  ]);
  const [image] = await imagesOf(path);
  assert.equal(image.alt, "Four people smiling on a video call");
  assert.deepEqual(image.focus, { x: 0.5, y: 0.5 });
  assert.equal(await size(image.urls.linkedin), "1200x627");
  assert.equal(await size(image.urls.wide), "1600x900");
  assert.equal(await size(image.urls.original), "2000x500");

  // Like the rest of the brief, the images can't be changed once the Chorus is started.
  const dashboard = await (
    await fetch(`${base}${path}?dashboard`, { headers: { cookie: owner } })
  ).text();
  assert.doesNotMatch(dashboard, /Add an image/);
});

test("at most 4 images, moving the focus makes new crops, removing deletes", async (t) => {
  const base = await listen(t);
  await finishOpenChoruses();
  const owner = await mockSession(base, "mock_dana");
  const picture = await halves();
  const cards: string[] = [];
  for (let i = 0; i < 4; i++) {
    cards.push(await (await upload(base, owner, picture)).text());
  }
  const fifth = await upload(base, owner, picture);
  assert.equal(fifth.status, 400);
  assert.match(await fifth.text(), /4 images/);
  const pending = { ownerId: await userIdOf("mock_dana"), chorusId: null };
  assert.equal((await imagesIn(pending)).length, 4);

  const [image] = await imagesIn(pending);
  const moved = await (
    await post(base, `/images/${image.id}`, owner, [
      ["alt", "Red on the left, blue on the right"],
      ["focusX", "0.05"],
      ["focusY", "0.5"],
    ])
  ).json();
  assert.notEqual(moved.linkedin, image.urls.linkedin);
  assert.ok((await redness(moved.linkedin)) > 200);
  const [saved] = await imagesIn(pending);
  assert.equal(saved.alt, "Red on the left, blue on the right");
  assert.deepEqual(saved.focus, { x: 0.05, y: 0.5 });

  const removed = await post(base, `/images/${idOf(cards[1])}/remove`, owner);
  assert.equal(removed.status, 204);
  assert.equal((await imagesIn(pending)).length, 3);
  const gone = /src="([^"]+)" alt="" draggable/.exec(cards[1])?.[1];
  assert.ok(!existsSync(`public${gone}`));
  await deleteImages(pending);
});

test("people get the images round robin, and can pick another or none", async (t) => {
  const base = await listen(t);
  const owner = await mockSession(base, "mock_maya");
  const path = await startChorus(base, owner, [
    "The first one",
    "The second one",
  ]);
  const people = [
    ["mock_aiko", "ch_aiko_li"],
    ["mock_ravi", "ch_ravi_x"],
    ["mock_sam", "ch_sam_li"],
  ];
  const editors: string[] = [];
  for (const [person, channel] of people) {
    const cookie = await mockSession(base, person);
    await post(base, `${path}/join`, cookie, [["channelId", channel]]);
    editors.push(
      await (
        await fetch(`${base}${path}/post`, { headers: { cookie } })
      ).text(),
    );
  }
  const checked = (page: string) =>
    /name="image" value="([^"]+)" checked/.exec(page)?.[1];
  assert.deepEqual(editors.map(checked), ["0", "1", "0"]);
  assert.match(editors[0], /How it looks on LinkedIn/);
  assert.match(editors[1], /Cropped to 16:9 for X/);

  const sam = await mockSession(base, "mock_sam");
  const chorusId = path.slice(3);
  const samId = await userIdOf("mock_sam");
  await post(base, `${path}/post`, sam, [
    ["text", "Out today. #TallyLaunch"],
    ["image", "1"],
  ]);
  assert.equal((await findPost(chorusId, samId))?.imageIndex, 1);
  await post(base, `${path}/post`, sam, [
    ["text", "Out today. #TallyLaunch"],
    ["image", "7"],
  ]);
  assert.equal((await findPost(chorusId, samId))?.imageIndex, 1);
  await post(base, `${path}/post`, sam, [
    ["text", "Out today. #TallyLaunch"],
    ["image", "none"],
  ]);
  assert.equal((await findPost(chorusId, samId))?.imageIndex, null);
  const editor = await (
    await fetch(`${base}${path}/post`, { headers: { cookie: sam } })
  ).text();
  assert.equal(checked(editor), "none");
});

test("approving sends the network's crop with its description to Buffer", async (t) => {
  const base = await listen(t);
  const owner = await mockSession(base, "mock_zsofia");
  const path = await startChorus(base, owner, ["The only one"]);
  const [image] = await imagesOf(path);
  const chorusId = path.slice(3);

  const aiko = await mockSession(base, "mock_aiko");
  await post(base, `${path}/join`, aiko, [["channelId", "ch_aiko_li"]]);
  await post(base, `${path}/post`, aiko, [["text", "Out today. #TallyLaunch"]]);
  const review = await (
    await fetch(`${base}${path}/post/review`, { headers: { cookie: aiko } })
  ).text();
  assert.ok(review.includes(image.urls.linkedin));
  await post(base, `${path}/post/approve`, aiko);
  const sent = await (await posts()).findOne({
    chorusId,
    channelId: "ch_aiko_li",
  });
  assert.deepEqual(scheduled.get(sent?.bufferPostId ?? "")?.assets, [
    {
      image: {
        url: image.urls.linkedin,
        metadata: { altText: "The only one" },
      },
    },
  ]);

  const ravi = await mockSession(base, "mock_ravi");
  await post(base, `${path}/join`, ravi, [["channelId", "ch_ravi_x"]]);
  await post(base, `${path}/post`, ravi, [
    ["text", "Shipping Tally 2.0 with the team was fun. #TallyLaunch"],
    ["image", "none"],
  ]);
  await post(base, `${path}/post/approve`, ravi);
  const plain = await (await posts()).findOne({
    chorusId,
    channelId: "ch_ravi_x",
  });
  assert.equal(plain?.status, "scheduled");
  assert.deepEqual(scheduled.get(plain?.bufferPostId ?? "")?.assets, []);
});

test("images go with the account, and in the cleanup once no post waits for them", async (t) => {
  const base = await listen(t);

  const dana = await mockSession(base, "mock_dana");
  const deleted = await startChorus(base, dana, ["A picture"]);
  const [gone] = await imagesOf(deleted);
  await deleteUserData(await userIdOf("mock_dana"));
  assert.ok(!existsSync(`public${gone.urls.original}`));

  const sam = await mockSession(base, "mock_sam");
  const old = await startChorus(base, sam, ["A picture"]);
  const [kept] = await imagesOf(old);
  await post(base, `${old}/join`, sam, [["channelId", "ch_sam_li"]]);
  await post(base, `${old}/post`, sam, [["text", "Out today. #TallyLaunch"]]);
  await post(base, `${old}/post/approve`, sam, [["as", "draft"]]);
  const chorusId = old.slice(3);
  await (await choruses()).updateOne(
    { _id: chorusId },
    { $set: { day: addDays(-3) } },
  );
  // A draft the person scheduled in Buffer for later still needs its image.
  await (await posts()).updateOne(
    { chorusId },
    { $set: { dueAt: new Date(Date.now() + 86_400_000) } },
  );
  await dailyCleanup();
  assert.ok(existsSync(`public${kept.urls.linkedin}`));
  assert.equal((await imagesOf(old)).length, 1);

  await (await posts()).updateOne(
    { chorusId },
    { $set: { status: "sent", dueAt: new Date(Date.now() - 60_000) } },
  );
  assert.ok((await dailyCleanup()).images >= 1);
  assert.ok(!existsSync(`public${kept.urls.linkedin}`));
  assert.deepEqual(await imagesOf(old), []);
  assert.equal((await dailyCleanup()).images, 0);
});

test("images added on the Start a Chorus form go to the new Chorus", async (t) => {
  const base = await listen(t);
  await finishOpenChoruses();
  const owner = await mockSession(base, "mock_aiko");
  const picture = await halves();

  const bad = await upload(base, owner, Buffer.from("not an image"));
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /isn't a JPEG, PNG or WebP image/);

  const card = await (await upload(base, owner, picture)).text();
  const id = idOf(card);
  assert.match(card, /Describe image <span data-n>1<\/span>/);
  const second = await (await upload(base, owner, picture)).text();
  const removed = idOf(second);
  await post(base, `/images/${removed}/remove`, owner);

  // Someone else can't move it, and it's not theirs to claim.
  const sam = await mockSession(base, "mock_sam");
  const moved = await post(base, `/images/${id}`, sam, [["focusX", "0.1"]]);
  assert.equal(moved.status, 404);

  const fresh = await (
    await post(base, `/images/${id}`, owner, [
      ["alt", "Typed first"],
      ["focusX", "0.05"],
      ["focusY", "0.5"],
    ])
  ).json();
  assert.ok((await redness(fresh.linkedin)) > 200);

  const brief = BRIEF();
  // A form error keeps the image, and the description is needed.
  const noAlt = await post(base, "/new", owner, [...brief, [`alt-${id}`, ""]]);
  assert.equal(noAlt.status, 400);
  const again = await noAlt.text();
  assert.match(again, /Image 1: Describe the image/);
  assert.ok(again.includes(`data-image="${id}"`));
  assert.ok(!again.includes(`data-image="${removed}"`));

  const made = await post(base, "/new", owner, [
    ...brief,
    [`alt-${id}`, "Red on the left"],
  ]);
  const path = made.headers.get("location") ?? "";
  const [image] = await imagesOf(path);
  assert.equal(image.id, id);
  assert.equal(image.alt, "Red on the left");
  assert.ok((await redness(image.urls.linkedin)) > 200);
  assert.deepEqual(
    await imagesIn({ ownerId: await userIdOf("mock_aiko"), chorusId: null }),
    [],
  );
});

test("form images never used go in the cleanup after a day", async (t) => {
  const base = await listen(t);
  await finishOpenChoruses();
  const owner = await mockSession(base, "mock_ravi");
  const card = await (await upload(base, owner, await halves())).text();
  const id = idOf(card);
  const original = /src="([^"]+)" alt="" draggable/.exec(card)?.[1];
  await dailyCleanup();
  assert.ok(await (await images()).findOne({ _id: id }));
  await (await images()).updateOne(
    { _id: id },
    { $set: { createdAt: new Date(Date.now() - 25 * 3_600_000) } },
  );
  assert.ok((await dailyCleanup()).images >= 1);
  assert.equal(await (await images()).findOne({ _id: id }), null);
  assert.ok(!existsSync(`public${original}`));
});
