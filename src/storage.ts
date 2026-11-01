// Where image files live. Buffer fetches an image when the post goes out, so in production they go to
// Vercel Blob, which gives a public https URL. Without BLOB_READ_WRITE_TOKEN (local dev, tests, mock mode)
// they go to public/uploads, which the local server serves. Buffer can't reach those, so real posts need Blob.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { del, list, put } from "@vercel/blob";
import { isMock } from "./buffer.ts";

const LOCAL_DIR = "public/uploads";

function useBlob(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  // Vercel's file system is read only, so a missing token there is a setup mistake.
  if (process.env.VERCEL) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set. See .env.example.");
  }
  return false;
}

// Buffer has to fetch the image from its URL. Mock mode never asks it to.
export function bufferCanFetch(): boolean {
  return isMock() || useBlob();
}

// path is like "images/<imageId>/<random>.jpg". Returns the URL to show and to send to Buffer.
export async function saveFile(path: string, data: Buffer): Promise<string> {
  if (useBlob()) {
    const { url } = await put(path, data, {
      access: "public",
      contentType: "image/jpeg",
    });
    return url;
  }
  const file = `${LOCAL_DIR}/${path}`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
  return `/uploads/${path}`;
}

export async function readSaved(url: string): Promise<Buffer> {
  if (url.startsWith("/uploads/")) {
    return readFile(`${LOCAL_DIR}/${url.slice("/uploads/".length)}`);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Every file under the folder, including the ones a scheduled post may still point at.
export async function deleteFolder(folder: string) {
  if (!useBlob()) {
    await rm(`${LOCAL_DIR}/${folder}`, { recursive: true, force: true });
    return;
  }
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `${folder}/`, cursor });
    if (page.blobs.length) await del(page.blobs.map((blob) => blob.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}
