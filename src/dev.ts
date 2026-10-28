import express from "express";
import app from "./app.ts";

const port = Number(process.env.PORT ?? 3000);

// Vercel serves public/ from its CDN and ignores express.static, so only the local server needs it.
express()
  .use(express.static("public"))
  .use(app)
  .listen(port, () => console.log(`Chorus on http://localhost:${port}`));
