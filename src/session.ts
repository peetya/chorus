import type { Request, Response } from "express";
import { env } from "./config.ts";
import { seal, unseal } from "./crypto.ts";

function secret(): string {
  const value = env("SESSION_SECRET");
  if (value.length < 32) {
    throw new Error(
      "SESSION_SECRET needs at least 32 characters: openssl rand -hex 32",
    );
  }
  return value;
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.cookie?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
}

function cookieOptions(path: string) {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path };
}

// The expiry is sealed too, so an old cookie can't be replayed after it should have expired.
export function writeSealed(
  res: Response,
  name: string,
  value: unknown,
  { maxAgeMs, path = "/" }: { maxAgeMs: number; path?: string },
) {
  const sealed = seal({ value, exp: Date.now() + maxAgeMs }, secret());
  res.cookie(name, sealed, { ...cookieOptions(path), maxAge: maxAgeMs });
}

export function readSealed<T>(req: Request, name: string): T | null {
  const cookie = readCookie(req, name);
  if (!cookie) return null;
  const opened = unseal<{ value: T; exp: number }>(cookie, secret());
  return opened && opened.exp > Date.now() ? opened.value : null;
}

export function clearSealed(res: Response, name: string, path = "/") {
  res.clearCookie(name, cookieOptions(path));
}
