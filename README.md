# Chorus

When a team, a meetup or an open source project has news, usually one account posts it and everyone else is
asked to share it. Chorus lets everyone announce it together instead: each person writes their own post, in
their own words, and it goes out from their own Buffer account at the same local time for everyone (9:00 in
Tokyo, then 9:00 in Budapest, then 9:00 in San Francisco). The news travels around the world with real
people behind it.

Built on the [Buffer API](https://developers.buffer.com). Work in progress, built in public.

## Run it locally

You need Node 24, Docker (for a local MongoDB) and [mkcert](https://github.com/FiloSottile/mkcert) (Buffer
only accepts https redirect URIs, localhost too).

1. Create an app client at [publish.buffer.com/settings/api](https://publish.buffer.com/settings/api) with
   the redirect URI `https://localhost:3000/callback`
2. Copy `.env.example` to `.env` and fill it in
3. Run it:

```bash
npm install
mkcert -install    # once per machine
npm run cert
npm run db         # MongoDB on localhost:27017 (app and tests), data browser on http://localhost:8081
npm run dev        # https://localhost:3000
npm test
npm run typecheck
npm run lint
```

No Buffer account? Set `BUFFER_MOCK=1` in `.env` and skip step 1 (the app client values can stay empty).
Sign-in then shows a list of fake people in different time zones, and nothing reaches Buffer.
`npm run mock-data` fills the local database with a Chorus for each state of the wall (coming up, live at
the start, halfway and near the end, finished), timed around the moment you run it. Run it again to reset:
it first removes everything the fake people made.

## Map data

The world map uses [Natural Earth](https://www.naturalearthdata.com/) land shapes and the time zone
positions from the [tz database](https://www.iana.org/time-zones), both public domain.
`node scripts/world-map.ts` rebuilds `public/world.svg` and `src/zones.ts` from them.

## License

[FSL-1.1-ALv2](LICENSE.md): you can read, run and change the code, but not offer it as a competing service.
Two years after each release, that release becomes Apache 2.0.
