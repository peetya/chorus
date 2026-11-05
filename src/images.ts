// The organizer's images: checked, cropped per network around a focus point, and stored (see storage.ts).
import { randomBytes } from "node:crypto";
import type { Filter } from "mongodb";
import sharp from "sharp";
import { collection } from "./db.ts";
import type { Post } from "./posts.ts";
import { deleteFolder, readSaved, saveFile } from "./storage.ts";

export const MAX_IMAGES = 4;
// Vercel refuses request bodies over 4.5 MB, and the form needs a little room too.
export const MAX_BYTES = 4 * 1024 * 1024;
export const MAX_ALT = 1000; // X allows 1,000 characters of alt text, the lowest of the networks

// 1.91:1 is LinkedIn's crop for an image too wide for it (see cropFor). X and Bluesky show 16:9, so they
// share one crop. Instagram takes 4:5 to 1.91:1 and at most 1440 px wide, and Buffer turns anything else
// into a reminder instead of posting it. 4:5 is the biggest it shows in the feed.
export const CROPS = {
  linkedin: { width: 1200, height: 627 },
  wide: { width: 1600, height: 900 },
  portrait: { width: 1080, height: 1350 },
};

const ORIGINAL_MAX = 2048; // what every other network gets, uncropped

export type Crop = keyof typeof CROPS | "original";
export type Focus = { x: number; y: number }; // 0..1 from the top left, the spot the crops keep in view

export type ChorusImage = {
  id: string;
  alt: string;
  focus: Focus;
  width: number;
  height: number;
  urls: Record<Crop, string>;
};

const FORMATS = ["jpeg", "png", "webp"];

export const IMAGE_PROBLEMS = {
  file: "Pick an image file first.",
  big: "That image is over 4 MB. Try a smaller one.",
  type: "That file isn't a JPEG, PNG or WebP image.",
};

// The bytes decide, not the file name or the browser's content type.
export async function imageProblem(
  data: Buffer,
): Promise<keyof typeof IMAGE_PROBLEMS | null> {
  if (data.length === 0) return "file";
  if (data.length > MAX_BYTES) return "big";
  try {
    const { format } = await sharp(data).metadata();
    if (FORMATS.includes(format)) return null;
  } catch {
    // Not an image sharp can read.
  }
  return "type";
}

export function altProblem(alt: string): string | null {
  if (!alt) return "Describe the image, for people who can't see it.";
  if (alt.length > MAX_ALT) {
    return `Keep the description under ${MAX_ALT.toLocaleString("en")} characters.`;
  }
  return null;
}

// "0.25" -> 0.25. Anything else, or outside 0..1, is the middle.
export function parseFocus(x: unknown, y: unknown): Focus {
  const part = (value: unknown) => {
    const n = typeof value === "string" && value ? Number(value) : Number.NaN;
    return n >= 0 && n <= 1 ? n : 0.5;
  };
  return { x: part(x), y: part(y) };
}

// The biggest box of this ratio that fits the image, centred on the focus as far as the edges allow.
export function cropBox(
  width: number,
  height: number,
  focus: Focus,
  ratio: number,
) {
  const w = Math.min(width, Math.round(height * ratio));
  const h = Math.min(height, Math.round(width / ratio));
  const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);
  return {
    left: clamp(Math.round(focus.x * width - w / 2), width - w),
    top: clamp(Math.round(focus.y * height - h / 2), height - h),
    width: w,
    height: h,
  };
}

// Turned the way the camera meant, at most 2048 px, as JPEG. sharp drops the metadata, like a phone
// photo's location, unless asked to keep it.
async function normalize(data: Buffer): Promise<Buffer> {
  return sharp(data)
    .rotate()
    .resize(ORIGINAL_MAX, ORIGINAL_MAX, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export async function makeCrops(original: Buffer, focus: Focus) {
  const { width = 0, height = 0 } = await sharp(original).metadata();
  const crop = ({ width: w, height: h }: { width: number; height: number }) =>
    sharp(original)
      .extract(cropBox(width, height, focus, w / h))
      .resize(w, h)
      .jpeg({ quality: 85 })
      .toBuffer();
  return {
    linkedin: await crop(CROPS.linkedin),
    wide: await crop(CROPS.wide),
    portrait: await crop(CROPS.portrait),
  };
}

// Each image has its own folder, so assigning it to a Chorus is a database change and no file moves. Each
// file gets a new random name, so a crop made again never replaces one a scheduled post points at.
function saveIn(imageId: string, data: Buffer): Promise<string> {
  return saveFile(
    `images/${imageId}/${randomBytes(12).toString("base64url")}.jpg`,
    data,
  );
}

async function saveCrops(imageId: string, original: Buffer, focus: Focus) {
  const crops = await makeCrops(original, focus);
  return {
    linkedin: await saveIn(imageId, crops.linkedin),
    wide: await saveIn(imageId, crops.wide),
    portrait: await saveIn(imageId, crops.portrait),
  };
}

// An image belongs to a Chorus, or to its organizer while they are still filling in "Start a Chorus". With
// a postId it is one person's own image for their post, and not one of the Chorus's images.
type ImageDoc = Omit<ChorusImage, "id"> & {
  _id: string;
  ownerId: string;
  chorusId: string | null;
  postId?: string;
  createdAt: Date;
};

export type ImageScope =
  | { chorusId: string }
  | { ownerId: string; chorusId: null };

export function images() {
  return collection<ImageDoc>("images", [
    { key: { chorusId: 1, createdAt: 1 } },
    { key: { ownerId: 1 } },
    { key: { postId: 1 }, sparse: true },
  ]);
}

const toImage = ({ _id, alt, focus, width, height, urls }: ImageDoc) => ({
  id: _id,
  alt,
  focus,
  width,
  height,
  urls,
});

// In the order they were added: imageIndex counts round this list.
export async function imagesIn(scope: ImageScope): Promise<ChorusImage[]> {
  const found = await (await images())
    .find({ ...scope, postId: { $exists: false } })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return found.map(toImage);
}

// null when the scope has 4 images already.
export async function addImage(
  ownerId: string,
  scope: ImageScope,
  data: Buffer,
  alt: string,
  focus: Focus,
): Promise<ChorusImage | null> {
  const id = randomBytes(9).toString("base64url");
  const original = await normalize(data);
  const { width = 0, height = 0 } = await sharp(original).metadata();
  const doc: ImageDoc = {
    _id: id,
    ownerId,
    chorusId: scope.chorusId,
    createdAt: new Date(),
    alt,
    focus,
    width,
    height,
    urls: {
      original: await saveIn(id, original),
      ...(await saveCrops(id, original, focus)),
    },
  };
  await (await images()).insertOne(doc);
  // Counted after adding, so two uploads at once can't make a fifth: the later one goes again.
  const kept = (await imagesIn(scope)).slice(0, MAX_IMAGES);
  if (kept.some((image) => image.id === id)) return toImage(doc);
  await deleteImages({ _id: id });
  return null;
}

// The image a person added to their own post, the newest if two uploads crossed.
export async function ownImageOf(postId: string): Promise<ChorusImage | null> {
  const [found] = await (await images())
    .find({ postId })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  return found ? toImage(found) : null;
}

// One per post: a new one replaces the old. The focus is the middle, since there's no focus picker here.
export async function addOwnImage(
  post: Pick<Post, "_id" | "userId" | "chorusId">,
  data: Buffer,
  alt: string,
): Promise<ChorusImage> {
  const id = randomBytes(9).toString("base64url");
  const original = await normalize(data);
  const { width = 0, height = 0 } = await sharp(original).metadata();
  const focus = { x: 0.5, y: 0.5 };
  const doc: ImageDoc = {
    _id: id,
    ownerId: post.userId,
    chorusId: post.chorusId,
    postId: post._id,
    createdAt: new Date(),
    alt,
    focus,
    width,
    height,
    urls: {
      original: await saveIn(id, original),
      ...(await saveCrops(id, original, focus)),
    },
  };
  await (await images()).insertOne(doc);
  await deleteImages({ postId: post._id, _id: { $ne: id } });
  return toImage(doc);
}

// A new focus makes new crops. The old ones stay in the image's folder until the cleanup.
export async function updateImage(
  scope: ImageScope,
  imageId: string,
  alt: string,
  focus: Focus,
): Promise<ChorusImage | null> {
  const all = await images();
  const image = await all.findOne({ _id: imageId, ...scope });
  if (!image) return null;
  const moved = image.focus.x !== focus.x || image.focus.y !== focus.y;
  const urls = moved
    ? {
        ...image.urls,
        ...(await saveCrops(
          imageId,
          await readSaved(image.urls.original),
          focus,
        )),
      }
    : image.urls;
  await all.updateOne({ _id: imageId }, { $set: { alt, focus, urls } });
  return toImage({ ...image, alt, focus, urls });
}

// Only before the Chorus starts, so no post can be using it.
export async function removeImage(scope: ImageScope, imageId: string) {
  await deleteImages({ _id: imageId, ...scope });
}

// The images on the "Start a Chorus" form go to the new Chorus, with the descriptions typed there.
export async function claimImages(
  ownerId: string,
  chorusId: string,
  alts: Map<string, string>,
) {
  for (const [id, alt] of alts) {
    await (await images()).updateOne(
      { _id: id, ownerId, chorusId: null },
      { $set: { chorusId, alt } },
    );
  }
}

// The files and the records. Returns how many images went.
export async function deleteImages(filter: Filter<ImageDoc>): Promise<number> {
  const all = await images();
  const found = await all.find(filter, { projection: { _id: 1 } }).toArray();
  for (const { _id } of found) await deleteFolder(`images/${_id}`);
  await all.deleteMany({ _id: { $in: found.map(({ _id }) => _id) } });
  return found.length;
}

// LinkedIn shows a photo whole from 3:1 wide to 4:5 tall, and a tall one takes the most room in the feed.
// 1.91:1 is its size for link previews, not photos. So it gets the whole image when it fits.
export function cropFor(
  service: string,
  image: { width: number; height: number },
): Crop {
  if (service === "linkedin") {
    const ratio = image.width / image.height;
    // A pixel off 4:5, like 1638 x 2048, still counts as 4:5.
    if (ratio < 4 / 5 - 0.005) return "portrait";
    return ratio > 3 ? "linkedin" : "original";
  }
  if (service === "twitter" || service === "bluesky") return "wide";
  if (service === "instagram") return "portrait";
  return "original";
}

// Instagram has no posts without an image.
export function needsImage(service: string): boolean {
  return service === "instagram";
}

// The image a post goes out with: the person's own one, or one of the Chorus's. imageIndex counts round
// the Chorus's images. null is "No image", except where the network needs one.
export function imageFor(
  images: ChorusImage[],
  post: Post,
  own: ChorusImage | null = null,
): ChorusImage | null {
  if (post.imageIndex === "own" && own) return own;
  if (images.length === 0)
    return own && needsImage(post.channelService) ? own : null;
  if (post.imageIndex === null && !needsImage(post.channelService)) return null;
  const index = typeof post.imageIndex === "number" ? post.imageIndex : 0;
  return images[index % images.length];
}

// The editor's choice: an image's number, "own", "none", or nothing sent (keep what was saved).
export function pickedImage(
  value: unknown,
  images: ChorusImage[],
  own: ChorusImage | null = null,
): Post["imageIndex"] {
  if (value === "none") return null;
  if (value === "own") return own ? "own" : undefined;
  const index =
    typeof value === "string" && /^\d$/.test(value) ? Number(value) : -1;
  return index >= 0 && index < images.length ? index : undefined;
}
