import express, { Router } from "express";
import { readSession, type Session } from "./auth.ts";
import { isMock } from "./buffer.ts";
import { createChorus, listOwned, parseChorus } from "./choruses.ts";
import { page } from "./html.ts";
import { myChoruses } from "./views/my-choruses.ts";
import { newChorusForm } from "./views/new-chorus.ts";

export const pages = Router();

function viewer(session: Session) {
  return { name: isMock() ? `${session.name} (mock mode)` : session.name };
}

pages.get("/me", async (req, res) => {
  const session = readSession(req);
  if (!session) return res.redirect("/login");
  const owned = await listOwned(session.userId);
  res.send(page("My Choruses", myChoruses(owned), { viewer: viewer(session) }));
});

pages.get("/new", (req, res) => {
  const session = readSession(req);
  if (!session) return res.redirect("/login");
  res.send(
    page("Start a Chorus", newChorusForm({}, []), {
      viewer: viewer(session),
      script: "brief.js",
    }),
  );
});

pages.post(
  "/new",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const session = readSession(req);
    if (!session) return res.redirect(303, "/login");
    const { input, errors } = parseChorus(req.body ?? {});
    if (errors.length) {
      return res.status(400).send(
        page("Start a Chorus", newChorusForm(input, errors), {
          viewer: viewer(session),
          script: "brief.js",
        }),
      );
    }
    await createChorus(session.userId, input);
    res.redirect(303, "/me");
  },
);
