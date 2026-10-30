import { timingSafeEqual } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import { auth } from "./auth.ts";
import { dailyCleanup } from "./cleanup.ts";
import { html, page } from "./html.ts";
import { pages } from "./pages.ts";
import { NotConnectedError } from "./users.ts";

const app = express();

// Auth and account pages must never be stored by a shared cache.
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store, private");
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

// Log only the message. Our error messages never include tokens or drafts.
const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof NotConnectedError) {
    return res.status(401).send(
      page(
        "Sign in again",
        html`<h1>Sign in again</h1>
<p>Chorus isn't connected to your Buffer account anymore. Sign in again, and you can go on where you were.</p>
<p><a href="/login" class="button primary">Sign in with Buffer</a></p>`,
      ),
    );
  }
  console.error(
    JSON.stringify({ event: "request_failed", message: String(err?.message) }),
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
