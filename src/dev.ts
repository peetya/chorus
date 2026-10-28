import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import express from "express";
import app from "./app.ts";

const port = Number(process.env.PORT ?? 3000);

// Vercel serves public/ from its CDN and ignores express.static, so only the local server needs it.
const server = express().use(express.static("public")).use(app);

// Buffer accepts only https redirect URIs, localhost too. `npm run cert` makes the certificate.
if (existsSync(".cert/key.pem")) {
  const cert = {
    key: readFileSync(".cert/key.pem"),
    cert: readFileSync(".cert/cert.pem"),
  };
  createServer(cert, server).listen(port, () =>
    console.log(`Chorus on https://localhost:${port}`),
  );
} else {
  server.listen(port, () =>
    console.log(
      `Chorus on http://localhost:${port} (no certificate: run npm run cert to sign in with Buffer)`,
    ),
  );
}
