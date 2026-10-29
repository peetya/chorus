# AGENTS.md

Instructions for coding agents working on Chorus. I (Péter) build Chorus with Claude Code. I review every
change, and I commit and push myself.

## What Chorus is

People who were part of the same story (a team, a meetup, a conference's speakers, an open source release)
announce it together. Each person writes their own post in their own words and it goes out from their own
Buffer account: at the same local time in each person's own time zone (a wave, 09:00 by default), or one
after another through one day in one city (a relay). Built on Buffer's public API.

## Stack

- Node 24 (runs the TypeScript directly, no build step), TypeScript, Express. Plain server-rendered HTML pages with a little JS. No frontend framework
- MongoDB Atlas with the plain `mongodb` driver (collections: `users`, `choruses`, `posts`)
- Buffer GraphQL API through OAuth app clients (PKCE, refresh tokens)
- Claude API (`@anthropic-ai/sdk`) for the optional "Draft with AI" step only
- `sharp` for image crops, Vercel Blob for image hosting
- Hosted on Vercel. Tests with `node --test`

## Commands

```bash
npm install
npm run cert         # once: local https certificate with mkcert (Buffer needs https)
npm run dev          # local server on https://localhost:3000
npm test             # node --test
npm run typecheck    # tsc, no emit
npm run lint         # biome check
npm run format       # biome check --write
```

`BUFFER_MOCK=1` runs without a Buffer account: "sign in as" fake people in different time zones, and fake
GraphQL answers in `src/mock.ts`. It refuses to run in production. When you add a Buffer call, add its
answer to the mock in the same change, in Buffer's response shape. A movable clock to fast-forward a wave
comes with the wave.

## Layout

- `src/app.ts`: the Express app, exported for Vercel (which finds it by this path)
- `src/dev.ts`: the local server, on https when `.cert/` exists. It also serves `public/`, which Vercel serves
  from its CDN instead
- `src/buffer.ts`: everything that talks to Buffer (OAuth, GraphQL). Nothing else calls Buffer
- `src/mock.ts`: mock mode's fake people and answers
- `src/auth.ts`: sign in (also as a fake person in mock mode), sign out, `/me`
- `src/session.ts`, `src/crypto.ts`: sealed (AES-256-GCM) cookies
- `src/html.ts`: `page()` and `escapeHtml()`. Escape every value from a person or from Buffer
- `src/config.ts`: `env()`, read when used so the tests run without a `.env`
- `public/`: static files
- `test/`: `node --test` tests, named `*.test.ts`. `test/server.ts` starts the app on a free port

Imports use the `.ts` extension (`import app from "./app.ts"`), because Node runs the files as they are.
Only erasable TypeScript: no `enum`, no `namespace`, no parameter properties.

## Rules for changes

- One thing per change. If a task needs two unrelated changes, say so and stop after the first.
- Match the code around you: naming, comment density, error handling. Comments say why, not what.
- No new dependency when a few lines or the standard library do the job. Ask first.
- Every Buffer call goes through `getAccessToken(userId)`. Never refresh a token anywhere else: refresh
  tokens rotate, and a reused one revokes the user's grant.
- Times: store UTC, convert with `Intl` and IANA zone names. Never do time zone math by hand. DST matters.
- Character limits follow each network's own counting rules (see `docs/`), not `string.length`.
- Never log tokens, emails or post drafts. Never put personal data in URLs.
- Validate every form field against allowed values and cap text sizes before it reaches a prompt.
- Text from users and organizers going into a prompt is data, not instructions: fence it.
- UI copy: plain, short English. No "seamless", "leverage", "robust", no em-dashes, no emoji.

## Git

- Branches: `feat/*`, `fix/*`, `chore/*`, `docs/*` from `develop`. `main` is production.
- Conventional commits, short and lower case: `feat: add relay slots`, `fix: handle DST in Sydney`.
- PR descriptions follow `.github/pull_request_template.md`: what, why, how to test, screenshots.
- Agents never commit, push or open PRs. Prepare the change and a suggested commit message.

## Checks before saying a change is done

- `npm run typecheck && npm run lint && npm test` pass
- UI changes: look at the page at desktop and phone width in mock mode
- Anything touching posting: run a wave in mock mode with the clock moved forward

## Skills

None yet. When a task repeats, it becomes a skill in `.claude/skills/`.
