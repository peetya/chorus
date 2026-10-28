import { randomBytes } from "node:crypto";
import { type Response, Router } from "express";
import {
  ACCOUNT_QUERY,
  type Account,
  authorizeUrl,
  createPkce,
  exchangeCode,
  graphql,
} from "./buffer.ts";
import { escapeHtml, page } from "./html.ts";
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

auth.get("/login", (_req, res) => {
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
  const { account } = await graphql<{ account: Account }>(
    tokens.accessToken,
    ACCOUNT_QUERY,
  );
  // The tokens are dropped for now. The token store will keep them, encrypted.
  writeSealed(
    res,
    SESSION_COOKIE,
    { accountId: account.id, name: account.name } satisfies Session,
    { maxAgeMs: 30 * 24 * 60 * 60_000 },
  );
  res.redirect("/me");
});

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
<p>You're signed in with Buffer.</p>
<form method="post" action="/logout"><button type="submit">Sign out</button></form>`,
    ),
  );
});
