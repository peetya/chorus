// All calls to Buffer go through this file.
import { createHash, randomBytes } from "node:crypto";
import { env } from "./config.ts";

const AUTH_URL = "https://auth.buffer.com/auth";
const TOKEN_URL = "https://auth.buffer.com/token";
const API_URL = "https://api.buffer.com";

// offline_access gives a refresh token, so we can schedule posts on the day without the person.
const SCOPES = "account:read posts:read posts:write offline_access";

export function createPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function authorizeUrl(state: string, challenge: string): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: env("BUFFER_CLIENT_ID"),
    redirect_uri: env("BUFFER_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "consent",
  }).toString();
  return url.toString();
}

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

// What Buffer's token errors usually mean, so the log says what to fix.
const TOKEN_ERROR_HINTS: Record<string, string> = {
  invalid_client: "check BUFFER_CLIENT_ID and BUFFER_CLIENT_SECRET",
  invalid_grant:
    "the code was used or expired, or the redirect URI differs from the one at login",
  invalid_scope: "a scope is not enabled on this app client",
};

export async function exchangeCode(
  code: string,
  verifier: string,
): Promise<Tokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    // Buffer wants the secret in the body (client_secret_post), not in HTTP Basic auth.
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env("BUFFER_REDIRECT_URI"),
      client_id: env("BUFFER_CLIENT_ID"),
      client_secret: env("BUFFER_CLIENT_SECRET"),
      code_verifier: verifier,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;

  if (!res.ok || json.error || !json.access_token) {
    const reason = json.error_description ?? json.error ?? `HTTP ${res.status}`;
    const hint = json.error ? TOKEN_ERROR_HINTS[json.error] : undefined;
    throw new Error(
      `Buffer token exchange failed: ${reason}${hint ? ` (${hint})` : ""}`,
    );
  }
  if (!json.refresh_token) {
    throw new Error(
      "Buffer sent no refresh token: offline_access must be in the requested scopes",
    );
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    // A little early, so a token never runs out in the middle of a request.
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000 - 30_000,
  };
}

type GraphqlResponse<T> = {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
};

export async function graphql<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res
    .json()
    .catch(() => null)) as GraphqlResponse<T> | null;

  // A failed query still comes back as HTTP 200, with the reason in errors[].
  const error = json?.errors?.[0];
  if (!res.ok || error || !json?.data) {
    const code = error?.extensions?.code ?? `HTTP ${res.status}`;
    throw new Error(`Buffer API error: ${code} ${error?.message ?? ""}`.trim());
  }
  return json.data;
}

export const ACCOUNT_QUERY = "query Account { account { id name } }";

export type Account = { id: string; name: string };
