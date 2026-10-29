import { randomBytes } from "node:crypto";
import express, { type Response, Router } from "express";
import {
  ACCOUNT_QUERY,
  type Account,
  authorizeUrl,
  createPkce,
  exchangeCode,
  graphql,
  isMock,
} from "./buffer.ts";
import { escapeHtml, page } from "./html.ts";
import { PEOPLE } from "./mock.ts";
import { clearSealed, readSealed, writeSealed } from "./session.ts";

const OAUTH_COOKIE = "chorus_oauth";
const SESSION_COOKIE = "chorus_session";

type OAuthState = { verifier: string; state: string };
export type Session = { accountId: string; name: string };

export const auth = Router();

function signInAgain(res: Response, status: number, message: string) {
  res
    .status(status)
    .send(
      page(
        "Sign in",
        `<h1>Sign in</h1>\n<p>${escapeHtml(message)}</p>\n<p><a href="/login">Try again</a></p>`,
      ),
    );
}

async function signIn(res: Response, accessToken: string) {
  const { account } = await graphql<{ account: Account }>(
    accessToken,
    ACCOUNT_QUERY,
  );
  writeSealed(
    res,
    SESSION_COOKIE,
    { accountId: account.id, name: account.name } satisfies Session,
    { maxAgeMs: 30 * 24 * 60 * 60_000 },
  );
  res.redirect("/me");
}

function mockSignInPage(): string {
  const people = PEOPLE.map(
    (p) =>
      `<li><button type="submit" name="person" value="${p.id}">${escapeHtml(p.name)}, ${escapeHtml(p.city)}</button></li>`,
  ).join("\n");
  return `<h1>Sign in as</h1>
<p>Mock mode: these people are fake, and nothing reaches Buffer.</p>
<form method="post" action="/login/mock">
<ul>
${people}
</ul>
</form>`;
}

auth.get("/login", (_req, res) => {
  if (isMock()) return res.send(page("Sign in", mockSignInPage()));
  const { verifier, challenge } = createPkce();
  const state = randomBytes(16).toString("base64url");
  // The verifier stays with us until the token exchange; Buffer only ever sees its hash.
  writeSealed(
    res,
    OAUTH_COOKIE,
    { verifier, state },
    { maxAgeMs: 10 * 60_000, path: "/callback" },
  );
  res.redirect(authorizeUrl(state, challenge));
});

auth.get("/callback", async (req, res) => {
  const oauth = readSealed<OAuthState>(req, OAUTH_COOKIE);
  clearSealed(res, OAUTH_COOKIE, "/callback");
  const { code, state, error, error_description: description } = req.query;

  if (typeof error === "string") {
    const reason = typeof description === "string" ? description : error;
    return signInAgain(res, 400, `Buffer didn't connect: ${reason}`);
  }
  // A missing cookie and a wrong state have different causes, so they get different messages.
  if (!oauth) {
    return signInAgain(
      res,
      400,
      "Your sign-in took too long, or it started on another site.",
    );
  }
  if (typeof code !== "string" || state !== oauth.state) {
    return signInAgain(res, 403, "This sign-in didn't start here.");
  }

  const tokens = await exchangeCode(code, oauth.verifier);
  // The tokens are dropped for now. The token store will keep them, encrypted.
  await signIn(res, tokens.accessToken);
});

auth.post(
  "/login/mock",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    if (!isMock()) return res.sendStatus(404);
    const person = PEOPLE.find((p) => p.id === req.body?.person);
    if (!person) return signInAgain(res, 400, "Pick someone from the list.");
    await signIn(res, person.id);
  },
);

auth.post("/logout", (_req, res) => {
  clearSealed(res, SESSION_COOKIE);
  res.redirect(303, "/");
});

auth.get("/me", (req, res) => {
  const session = readSealed<Session>(req, SESSION_COOKIE);
  if (!session) return res.redirect("/");
  res.send(
    page(
      "Chorus",
      `<h1>Hi ${escapeHtml(session.name)}</h1>
<p>${isMock() ? "You're signed in as a fake person (mock mode)." : "You're signed in with Buffer."}</p>
<form method="post" action="/logout"><button type="submit">Sign out</button></form>`,
    ),
  );
});
