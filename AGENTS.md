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
- OpenAI API (`openai`) for the optional "Draft with AI" step only (`src/ai.ts`). Mock mode fakes it
- `sharp` for image crops, Vercel Blob for image hosting
- Hosted on Vercel. Tests with `node --test`

## Commands

```bash
npm install
npm run cert         # once: local https certificate with mkcert (Buffer needs https)
npm run db           # MongoDB in Docker on localhost:27017; the tests need it too
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
- `src/mock.ts`: mock mode's fake people, answers and tokens
- `src/db.ts`: the one `MongoClient`. `src/users.ts`: users, their encrypted tokens, `getAccessToken()`
- `src/auth.ts`: sign in (also as a fake person in mock mode), sign out, `readSession()`
- `src/choruses.ts`: the `choruses` collection, and reading and checking the "Start a Chorus" form
- `src/posts.ts`: the `posts` collection (one per person in a Chorus), joining, and which channels can't post
- `src/checks.ts`: the free checks on a post (length the way each network counts it, the main hashtag,
  the hashtag limit, "Please avoid", and facts that aren't on the fact card). Only "too long" blocks
- `src/time.ts`: local time in a zone to UTC and back (DST-safe, `Intl` only), and when a wave post goes out
- `src/pages.ts`: the routes for My Choruses (`/me`), Start a Chorus (`/new`), the Chorus page (`/c/:id`),
  joining it (`/c/:id/join`), writing your post (`/c/:id/post`), and approving or withdrawing it
- A post moves drafting, scheduling, scheduled (and withdrawing, back to drafting) with one atomic
  `findOneAndUpdate` per step in `src/posts.ts`, so a double click can't create two Buffer posts
- `src/session.ts`, `src/crypto.ts`: sealed (AES-256-GCM) cookies
- `src/html.ts`: `page()` (with the header), and the `html` tagged template that escapes every value
- `src/views/`: the markup of each screen, as functions that return `html`. `labels.ts` has the small
  formatters (short names like "Péter H.", network names, days). Routes stay in `pages.ts` and
  `auth.ts` and hold no markup
- `src/config.ts`: `env()` and `secretEnv()`, read when used so the tests run without a `.env`
- `public/`: static files: the landing page, `style.css` (the design's colors and fonts), the logo, and
  `brief.js` (list rows and the live fact card on the form), `copy.js` (the invite link's copy button), `write.js` (sends the text to
  `/c/:id/post/check` while you type; the checks run only on the server, so they live in one place).
  Pages work without JS where they can
- `test/`: `node --test` tests, named `*.test.ts`. `test/server.ts` starts the app on a free port

Imports use the `.ts` extension (`import app from "./app.ts"`), because Node runs the files as they are.
Only erasable TypeScript: no `enum`, no `namespace`, no parameter properties.

## Rules for changes

- One thing per change. If a task needs two unrelated changes, say so and stop after the first.
- Match the code around you: naming, comment density, error handling. Comments say why, not what.
- No new dependency when a few lines or the standard library do the job. Ask first.
- Every Buffer call goes through `getAccessToken(userId)`. Never refresh a token anywhere else: refresh
  tokens rotate, and a reused one revokes the user's grant.
- Buffer has no webhooks, and the API budget is small. Ask about a post only through the status checks
  (at most 3 per post, run when someone opens the wall, each claimed first). No cron, no polling loop.
- Times: store UTC, convert with `Intl` and IANA zone names. Never do time zone math by hand. DST matters.
- Character limits follow each network's own counting rules (see `docs/`), not `string.length`.
- Build markup with `html` only, never with plain template strings: it escapes every value, so post text
  can't turn into script on someone else's screen. `raw()` is for our own constant markup, like an icon.
- Never log tokens, emails or post drafts. Never put personal data in URLs.
- The organizer sees each person's status, channel and time, never their text. Other people show as
  "Péter H." on every Chorus page, the dashboard too.
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
