// All calls to Buffer go through this file.
import { createHash, randomBytes } from "node:crypto";
import { env } from "./config.ts";
import { mockGraphql, mockRefresh } from "./mock.ts";

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

// code is Buffer's OAuth error code, when it sent one.
export class TokenError extends Error {
  code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    // Buffer wants the secret in the body (client_secret_post), not in HTTP Basic auth.
    body: new URLSearchParams({
      ...params,
      client_id: env("BUFFER_CLIENT_ID"),
      client_secret: env("BUFFER_CLIENT_SECRET"),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;

  if (!res.ok || json.error || !json.access_token) {
    const reason = json.error_description ?? json.error ?? `HTTP ${res.status}`;
    const hint = json.error ? TOKEN_ERROR_HINTS[json.error] : undefined;
    throw new TokenError(
      `Buffer token request failed: ${reason}${hint ? ` (${hint})` : ""}`,
      json.error,
    );
  }
  if (!json.refresh_token) {
    throw new TokenError(
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

export function exchangeCode(code: string, verifier: string): Promise<Tokens> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: env("BUFFER_REDIRECT_URI"),
    code_verifier: verifier,
  });
}

// Each refresh gives a new refresh token and the old one stops working. Only getAccessToken calls this.
export async function refreshTokens(refreshToken: string): Promise<Tokens> {
  if (isMock()) return mockRefresh(refreshToken);
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

type GraphqlResponse<T> = {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
};

// code is Buffer's GraphQL error code, like NOT_FOUND, or the HTTP status when there was none.
export class BufferApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(`Buffer API error: ${code} ${message}`.trim());
    this.code = code;
  }
}

// Mock mode answers from fake people instead of Buffer (see mock.ts). Never in production.
export function isMock(): boolean {
  if (process.env.BUFFER_MOCK !== "1") return false;
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("BUFFER_MOCK is on in production. Turn it off.");
  }
  return true;
}

export async function graphql<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  if (isMock()) return mockGraphql(accessToken, query, variables) as T;
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
    throw new BufferApiError(code, error?.message ?? "");
  }
  return json.data;
}

export const ACCOUNT_QUERY =
  "query Account { account { id name organizations { id } } }";

export type Account = {
  id: string;
  name: string;
  organizations: { id: string }[];
};

// Organization has no channels field, so channels are a query of their own, one per organization.
const CHANNELS_QUERY = `query Channels($input: ChannelsInput!) {
  channels(input: $input) { id name service timezone isQueuePaused isLocked isDisconnected }
}`;

export type Channel = {
  id: string;
  name: string;
  service: string;
  timezone: string; // Buffer's default is Europe/London when the person never set one
  isQueuePaused: boolean;
  isLocked: boolean;
  isDisconnected: boolean;
};

// The caller passes a token from getAccessToken, like for every other call.
export async function getChannels(
  accessToken: string,
  organizationIds: string[],
): Promise<Channel[]> {
  const lists = await Promise.all(
    organizationIds.map(async (organizationId) => {
      const { channels } = await graphql<{ channels: Channel[] }>(
        accessToken,
        CHANNELS_QUERY,
        { input: { organizationId } },
      );
      return channels;
    }),
  );
  return lists.flat();
}

const CREATE_POST = `mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess { post { id dueAt status } }
    ... on MutationError { message }
  }
}`;

const DELETE_POST = `mutation DeletePost($input: DeletePostInput!) {
  deletePost(input: $input) {
    ... on DeletePostSuccess { id }
    ... on MutationError { message }
  }
}`;

const POST_STATUS = `query PostStatus($input: PostInput!) {
  post(input: $input) { status dueAt externalLink error { message } }
}`;

// status is one of draft, needs_approval, scheduled, sending, sent, error.
export type BufferPost = {
  status: string;
  dueAt: string | null; // changes when the person schedules a draft in Buffer
  externalLink: string | null;
  error: { message: string } | null;
};

const isNotFound = (err: unknown) =>
  err instanceof BufferApiError && err.code === "NOT_FOUND";

// null when the post is gone: the person deleted it in Buffer.
export async function getPost(
  accessToken: string,
  id: string,
): Promise<BufferPost | null> {
  try {
    const { post } = await graphql<{ post: BufferPost }>(
      accessToken,
      POST_STATUS,
      { input: { id } },
    );
    return post;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

// Some networks refuse a post without their own metadata. Google Business goes under "google".
function metadataFor(
  service: string,
  text: string,
): Record<string, unknown> | undefined {
  switch (service) {
    case "instagram":
      return { instagram: { type: "post", shouldShareToFeed: true } };
    case "facebook":
      return { facebook: { type: "post" } };
    case "googlebusiness":
      return { google: { type: "whats_new" } };
    case "youtube":
      return { youtube: { title: text.split("\n")[0].slice(0, 100) } };
    default:
      return undefined;
  }
}

export type Scheduled =
  | { ok: true; id: string; dueAt: string }
  | { ok: false; message: string };

// Errors about the post itself come back as data, not as GraphQL errors, so they are a result here.
export async function createPost(
  accessToken: string,
  post: {
    channelId: string;
    service: string;
    text: string;
    dueAt: Date;
    aiAssisted: boolean;
    saveToDraft: boolean; // the post lands in the person's Buffer drafts, not the queue
  },
): Promise<Scheduled> {
  const { createPost: result } = await graphql<{
    createPost: { post?: { id: string; dueAt: string }; message?: string };
  }>(accessToken, CREATE_POST, {
    input: {
      channelId: post.channelId,
      text: post.text,
      schedulingType: "automatic",
      mode: "customScheduled",
      dueAt: post.dueAt.toISOString(),
      assets: [],
      needsApproval: false,
      aiAssisted: post.aiAssisted,
      saveToDraft: post.saveToDraft,
      metadata: metadataFor(post.service, post.text),
    },
  });
  return result.post
    ? { ok: true, id: result.post.id, dueAt: result.post.dueAt }
    : {
        ok: false,
        message: result.message ?? "Buffer didn't schedule the post.",
      };
}

export async function deletePost(
  accessToken: string,
  id: string,
): Promise<string | null> {
  try {
    const { deletePost: result } = await graphql<{
      deletePost: { id?: string; message?: string };
    }>(accessToken, DELETE_POST, { input: { id } });
    return result.id
      ? null
      : (result.message ?? "Buffer didn't delete the post.");
  } catch (err) {
    // Already deleted in Buffer is what a withdraw wants anyway.
    if (isNotFound(err)) return null;
    throw err;
  }
}
