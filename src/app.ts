import { timingSafeEqual } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import { auth } from "./auth.ts";
import { dailyCleanup } from "./cleanup.ts";
import { html, page } from "./html.ts";
import { pages } from "./pages.ts";
import { NotConnectedError } from "./users.ts";

const app = express();
app.disable("x-powered-by");

// Every script is a file in public/, so the pages can refuse any other. The inline styles are the
// landing map's positions. Files in public/ come from Vercel's CDN without these headers.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https://*.public.blob.vercel-storage.com",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Auth and account pages must never be stored by a shared cache, so no page is.
app.use((_req, res, next) => {
  res.set({
    "Cache-Control": "no-store, private",
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  next();
});

// SameSite=Lax cookies already keep other sites' forms out. A second lock: a form posted from another
// site is refused. Requests without an Origin, like the tests' own, aren't from a browser form.
app.use((req, res, next) => {
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host") ?? req.get("host");
  if (req.method === "POST" && origin && URL.parse(origin)?.host !== host) {
    return res.sendStatus(403);
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Vercel's cron calls this once a day with "Bearer <CRON_SECRET>". Without the secret set, it never runs.
app.get("/api/cleanup", async (req, res) => {
  const secret = process.env.CRON_SECRET?.trim();
  const sent = Buffer.from(req.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    sent.length !== wanted.length ||
    !timingSafeEqual(sent, wanted)
  ) {
    return res.sendStatus(401);
  }
  const removed = await dailyCleanup();
  console.log(JSON.stringify({ event: "cleanup", ...removed }));
  res.json(removed);
});

app.use(auth);
app.use(pages);

// Log the message and the stack, never the request. Our error messages never include tokens or drafts.
const onError: ErrorRequestHandler = (err, _req, res, next) => {
  // The response already started, so Express can only close it.
  if (res.headersSent) return next(err);
  if (err instanceof NotConnectedError) {
    return res.status(401).send(
      page(
        "Sign in again",
        html`<h1>Sign in again</h1>
<p>Chorus isn't connected to your Buffer account anymore. Sign in again, and you can go on where you were.</p>
<p><a href="/login/buffer" class="button primary">Sign in with Buffer</a></p>`,
      ),
    );
  }
  // Almost always an image over the limit: the other forms are far smaller. new-images.js shows it.
  if (err?.type === "entity.too.large") {
    return res
      .status(413)
      .type("text")
      .send("That image is over 4 MB. Try a smaller one.");
  }
  console.error(
    JSON.stringify({
      event: "request_failed",
      message: String(err?.message),
      stack: err?.stack,
    }),
  );
  res.status(500).send(
    page(
      "Something went wrong",
      html`<h1>Something went wrong</h1>
<p>Please try again in a minute. <a href="/">Back to the start</a></p>`,
    ),
  );
};
app.use(onError);

export default app;
