import express, { type ErrorRequestHandler } from "express";
import { auth } from "./auth.ts";
import { page } from "./html.ts";

const app = express();

// Auth and account pages must never be stored by a shared cache.
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store, private");
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(auth);

// Log only the message. Our error messages never include tokens or drafts.
const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(
    JSON.stringify({ event: "request_failed", message: String(err?.message) }),
  );
  res
    .status(500)
    .send(
      page(
        "Something went wrong",
        '<h1>Something went wrong</h1>\n<p>Please try again in a minute. <a href="/">Back to the start</a></p>',
      ),
    );
};
app.use(onError);

export default app;
