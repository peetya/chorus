import express, { type Response, Router } from "express";
import { readSession, type Session } from "./auth.ts";
import {
  ACCOUNT_QUERY,
  type Account,
  type Channel,
  getChannels,
  graphql,
  isMock,
} from "./buffer.ts";
import {
  addDays,
  type Chorus,
  chorusesById,
  createChorus,
  getChorus,
  listOwned,
  parseChorus,
} from "./choruses.ts";
import { page } from "./html.ts";
import {
  channelProblem,
  findPost,
  joinChorus,
  joinedBy,
  postsOf,
} from "./posts.ts";
import { getAccessToken, getUser, namesOf } from "./users.ts";
import { chorusNotFound, chorusPage } from "./views/chorus.ts";
import { joinPage } from "./views/join.ts";
import { myChoruses } from "./views/my-choruses.ts";
import { newChorusForm } from "./views/new-chorus.ts";

export const pages = Router();

function viewer(session: Session) {
  return { name: isMock() ? `${session.name} (mock mode)` : session.name };
}

// A wave runs through every time zone, so joining stays open until the day after.
function isOver(chorus: Chorus): boolean {
  return chorus.day < addDays(-1);
}

function notFound(res: Response, session: Session | null) {
  res.status(404).send(
    page("Not found", chorusNotFound(), {
      viewer: session && viewer(session),
    }),
  );
}

async function channelsFor(userId: string): Promise<Channel[]> {
  const token = await getAccessToken(userId);
  let organizationIds = (await getUser(userId))?.organizationIds;
  // Signed in before organizations were saved: ask Buffer for them.
  if (!organizationIds) {
    const { account } = await graphql<{ account: Account }>(
      token,
      ACCOUNT_QUERY,
    );
    organizationIds = account.organizations.map((org) => org.id);
  }
  return getChannels(token, organizationIds);
}

pages.get("/me", async (req, res) => {
  const session = readSession(req);
  if (!session) return res.redirect("/login");
  const owned = await listOwned(session.userId);
  const joinedIds = (await joinedBy(session.userId)).map(
    (post) => post.chorusId,
  );
  const joined = (await chorusesById(joinedIds)).filter(
    (chorus) => chorus.ownerId !== session.userId,
  );
  const organizers = await namesOf(joined.map((chorus) => chorus.ownerId));
  const items = [
    ...owned.map((chorus) => ({ chorus, organizer: null })),
    ...joined.map((chorus) => ({
      chorus,
      organizer: organizers.get(chorus.ownerId) ?? "someone",
    })),
  ].sort((a, b) => a.chorus.day.localeCompare(b.chorus.day));
  res.send(page("My Choruses", myChoruses(items), { viewer: viewer(session) }));
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
    const chorus = await createChorus(session.userId, input);
    res.redirect(303, `/c/${chorus._id}`);
  },
);

pages.get("/c/:id", async (req, res) => {
  const session = readSession(req);
  const chorus = await getChorus(req.params.id);
  if (!chorus) return notFound(res, session);
  const joined = await postsOf(chorus._id);
  const names = await namesOf([
    chorus.ownerId,
    ...joined.map((post) => post.userId),
  ]);
  const isOrganizer = session?.userId === chorus.ownerId;
  const view = {
    chorus,
    organizer: names.get(chorus.ownerId) ?? "Someone",
    people: joined.map((post) => names.get(post.userId) ?? "?"),
    isOrganizer,
    post: joined.find((post) => post.userId === session?.userId) ?? null,
    over: isOver(chorus),
    inviteUrl: `https://${req.get("host")}/c/${chorus._id}`,
  };
  res.send(
    page(chorus.title, chorusPage(view), {
      viewer: session && viewer(session),
      script: isOrganizer ? "copy.js" : undefined,
    }),
  );
});

pages.get("/c/:id/join", async (req, res) => {
  const session = readSession(req);
  const chorus = await getChorus(req.params.id);
  if (!chorus) return notFound(res, session);
  if (!session) return res.redirect(`/login?next=/c/${chorus._id}/join`);
  if (isOver(chorus)) return res.redirect(`/c/${chorus._id}`);
  const channels = await channelsFor(session.userId);
  const post = await findPost(chorus._id, session.userId);
  res.send(
    page("Pick your channel", joinPage(chorus, channels, post?.channelId), {
      viewer: viewer(session),
    }),
  );
});

pages.post(
  "/c/:id/join",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const session = readSession(req);
    const chorus = await getChorus(req.params.id);
    if (!chorus) return notFound(res, session);
    if (!session) return res.redirect(303, `/login?next=/c/${chorus._id}/join`);
    if (isOver(chorus)) return res.redirect(303, `/c/${chorus._id}`);
    // Ask Buffer again: the browser could send any id, and a channel can change in the meantime.
    const channels = await channelsFor(session.userId);
    const channel = channels.find((c) => c.id === req.body?.channelId);
    const problem = channel
      ? channelProblem(channel)
      : "Pick one of your channels.";
    if (!channel || problem) {
      return res.status(400).send(
        page(
          "Pick your channel",
          joinPage(chorus, channels, undefined, problem ?? undefined),
          {
            viewer: viewer(session),
          },
        ),
      );
    }
    await joinChorus(chorus._id, session.userId, channel);
    res.redirect(303, `/c/${chorus._id}`);
  },
);
