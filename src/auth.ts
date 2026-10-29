import { randomBytes } from "node:crypto";
import express, { type Request, type Response, Router } from "express";
import {
  ACCOUNT_QUERY,
  type Account,
  authorizeUrl,
  createPkce,
  exchangeCode,
  graphql,
  isMock,
  type Tokens,
} from "./buffer.ts";
import { escapeHtml, page } from "./html.ts";
import { mockTokens, PEOPLE } from "./mock.ts";
import { clearSealed, readSealed, writeSealed } from "./session.ts";
import { saveUser } from "./users.ts";

const OAUTH_COOKIE = "chorus_oauth";
const SESSION_COOKIE = "chorus_session";

type OAuthState = { verifier: string; state: string };
export type Session = { userId: string; name: string };

export const auth = Router();

// Cookies from before the token store hold no userId; those people sign in again.
export function readSession(req: Request): Session | null {
  const session = readSealed<Session>(req, SESSION_COOKIE);
  return session?.userId ? session : null;
}

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

async function signIn(res: Response, tokens: Tokens) {
  const { account } = await graphql<{ account: Account }>(
    tokens.accessToken,
    ACCOUNT_QUERY,
  );
  const userId = await saveUser(account, tokens);
  writeSealed(
    res,
    SESSION_COOKIE,
    { userId, name: account.name } satisfies Session,
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
<ul class="people">
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

  await signIn(res, await exchangeCode(code, oauth.verifier));
});

auth.post(
  "/login/mock",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    if (!isMock()) return res.sendStatus(404);
    const person = PEOPLE.find((p) => p.id === req.body?.person);
    if (!person) return signInAgain(res, 400, "Pick someone from the list.");
    await signIn(res, mockTokens(person.id));
  },
);

auth.post("/logout", (_req, res) => {
  clearSealed(res, SESSION_COOKIE);
  res.redirect(303, "/");
});
