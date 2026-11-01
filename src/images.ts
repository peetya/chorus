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

// LinkedIn shows link and image posts at 1.91:1; X and Bluesky at 16:9, so they share one crop.
export const CROPS = {
  linkedin: { width: 1200, height: 627 },
  wide: { width: 1600, height: 900 },
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

// The bytes decide, not the file name or the browser's content type.
export async function imageProblem(data: Buffer): Promise<string | null> {
  if (data.length === 0) return "Pick an image file first.";
  if (data.length > MAX_BYTES)
    return "That image is over 4 MB. Try a smaller one.";
  try {
    const { format } = await sharp(data).metadata();
    if (FORMATS.includes(format)) return null;
  } catch {
    // Not an image sharp can read.
  }
  return "That file isn't a JPEG, PNG or WebP image.";
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
  return { linkedin: await crop(CROPS.linkedin), wide: await crop(CROPS.wide) };
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
  };
}

// An image belongs to a Chorus, or to its organizer while they are still filling in "Start a Chorus".
type ImageDoc = Omit<ChorusImage, "id"> & {
  _id: string;
  ownerId: string;
  chorusId: string | null;
  createdAt: Date;
};

export type ImageScope =
  | { chorusId: string }
  | { ownerId: string; chorusId: null };

export function images() {
  return collection<ImageDoc>("images", [
    { key: { chorusId: 1, createdAt: 1 } },
    { key: { ownerId: 1 } },
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
    .find(scope)
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

export function cropFor(service: string): Crop {
  if (service === "linkedin") return "linkedin";
  if (service === "twitter" || service === "bluesky") return "wide";
  return "original";
}

// The image a post goes out with. imageIndex counts round the images. null is "No image".
export function imageFor(
  images: ChorusImage[],
  post: Post,
): ChorusImage | null {
  if (post.imageIndex === null || images.length === 0) return null;
  return images[(post.imageIndex ?? 0) % images.length];
}

// The editor's choice: an image's number, "none", or nothing sent (keep what was saved).
export function pickedImage(
  value: unknown,
  images: ChorusImage[],
): number | null | undefined {
  if (value === "none") return null;
  const index =
    typeof value === "string" && /^\d$/.test(value) ? Number(value) : -1;
  return index >= 0 && index < images.length ? index : undefined;
}
