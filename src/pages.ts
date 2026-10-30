import express, { type Response, Router } from "express";
import { readSession, type Session } from "./auth.ts";
import {
  ACCOUNT_QUERY,
  type Account,
  type Channel,
  createPost,
  deletePost,
  getChannels,
  graphql,
  isMock,
} from "./buffer.ts";
import { checkPost } from "./checks.ts";
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
  backToDraft,
  channelProblem,
  claimForScheduling,
  claimForWithdraw,
  findPost,
  joinChorus,
  joinedBy,
  markScheduled,
  postsOf,
  saveText,
  stillScheduled,
} from "./posts.ts";
import { waveDueAt } from "./time.ts";
import { getAccessToken, getUser, namesOf } from "./users.ts";
import { chorusNotFound, chorusPage } from "./views/chorus.ts";
import { joinPage } from "./views/join.ts";
import { shortName } from "./views/labels.ts";
import { myChoruses } from "./views/my-choruses.ts";
import { newChorusForm } from "./views/new-chorus.ts";
import { reviewPage } from "./views/review.ts";
import { checkList, writePage } from "./views/write.ts";

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
    joined: joined.map((post) => ({
      name: names.get(post.userId) ?? "?",
      post,
    })),
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
  const post = await findPost(chorus._id, session.userId);
  // A scheduled post lives in Buffer on its channel. Withdraw it first to change the channel.
  if (post && post.status !== "drafting")
    return res.redirect(`/c/${chorus._id}`);
  const channels = await channelsFor(session.userId);
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
    const existing = await findPost(chorus._id, session.userId);
    if (existing && existing.status !== "drafting") {
      return res.redirect(303, `/c/${chorus._id}`);
    }
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
    res.redirect(303, `/c/${chorus._id}/post`);
  },
);

async function organizerName(chorus: Chorus): Promise<string> {
  return (
    (await namesOf([chorus.ownerId])).get(chorus.ownerId) ?? "the organizer"
  );
}

pages.get("/c/:id/post", async (req, res) => {
  const session = readSession(req);
  const chorus = await getChorus(req.params.id);
  if (!chorus) return notFound(res, session);
  if (!session) return res.redirect(`/login?next=/c/${chorus._id}/post`);
  const post = await findPost(chorus._id, session.userId);
  if (!post) return res.redirect(`/c/${chorus._id}/join`);
  if (post.status !== "drafting") return res.redirect(`/c/${chorus._id}`);
  const organizer = await organizerName(chorus);
  // A new post starts with the main hashtag, so nobody forgets it.
  const text = post.text ?? `\n\n${chorus.hashtags[0] ?? ""}`;
  const result = checkPost(
    text,
    chorus,
    post.channelService,
    shortName(organizer),
  );
  res.send(
    page(
      "Your post",
      writePage(chorus, post, organizer, text, result, req.query.saved === "1"),
      { viewer: viewer(session), script: "write.js" },
    ),
  );
});

pages.post(
  "/c/:id/post",
  express.urlencoded({ extended: false, limit: "64kb" }),
  async (req, res) => {
    const session = readSession(req);
    const chorus = await getChorus(req.params.id);
    if (!chorus) return notFound(res, session);
    if (!session) return res.redirect(303, `/login?next=/c/${chorus._id}/post`);
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    // A draft is saved even when it's too long: the checks stop it at approval, not here.
    const saved = await saveText(chorus._id, session.userId, text);
    if (!saved) return res.redirect(303, `/c/${chorus._id}`);
    const next =
      req.body?.action === "approve" ? "post/review" : "post?saved=1";
    res.redirect(303, `/c/${chorus._id}/${next}`);
  },
);

// The editor sends the text here while the person types. No Buffer call, so it costs nothing.
pages.post(
  "/c/:id/post/check",
  express.json({ limit: "64kb" }),
  async (req, res) => {
    const session = readSession(req);
    const chorus = await getChorus(req.params.id);
    const post =
      chorus && session && (await findPost(chorus._id, session.userId));
    if (!chorus || !post) return res.sendStatus(403);
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    const organizer = shortName(await organizerName(chorus));
    res
      .type("html")
      .send(
        checkList(checkPost(text, chorus, post.channelService, organizer))
          .value,
      );
  },
);

pages.get("/c/:id/post/review", async (req, res) => {
  const session = readSession(req);
  const chorus = await getChorus(req.params.id);
  if (!chorus) return notFound(res, session);
  if (!session) return res.redirect(`/login?next=/c/${chorus._id}/post`);
  const post = await findPost(chorus._id, session.userId);
  if (post?.status !== "drafting") return res.redirect(`/c/${chorus._id}`);
  const organizer = shortName(await organizerName(chorus));
  const result = checkPost(
    post.text ?? "",
    chorus,
    post.channelService,
    organizer,
  );
  res.send(
    page("Check your post", reviewPage(chorus, post, result), {
      viewer: viewer(session),
    }),
  );
});

pages.post("/c/:id/post/approve", async (req, res) => {
  const session = readSession(req);
  const chorus = await getChorus(req.params.id);
  if (!chorus) return notFound(res, session);
  if (!session) return res.redirect(303, `/login?next=/c/${chorus._id}/post`);
  if (isOver(chorus)) return res.redirect(303, `/c/${chorus._id}`);
  // Only one request gets the post. A double click finds it taken and just shows the Chorus.
  const post = await claimForScheduling(chorus._id, session.userId);
  if (!post) return res.redirect(303, `/c/${chorus._id}`);

  // The saved text is checked again here: the review page could be old, or skipped.
  const organizer = shortName(await organizerName(chorus));
  const result = checkPost(
    post.text ?? "",
    chorus,
    post.channelService,
    organizer,
  );
  if (result.checks.some((check) => check.level === "block")) {
    await backToDraft(post._id);
    return res.redirect(303, `/c/${chorus._id}/post/review`);
  }

  try {
    const scheduled = await createPost(await getAccessToken(session.userId), {
      channelId: post.channelId,
      service: post.channelService,
      text: post.text ?? "",
      dueAt: waveDueAt(chorus.day, chorus.localTime, post.channelTz),
      aiAssisted: post.aiShaped,
    });
    if (!scheduled.ok) {
      await backToDraft(post._id, scheduled.message);
      return res.redirect(303, `/c/${chorus._id}/post`);
    }
    await markScheduled(post._id, scheduled.id, new Date(scheduled.dueAt));
  } catch (err) {
    // Known limit: if Buffer created the post but its answer got lost, trying again makes a second
    // post. The status checks on the live wall are where that would show up.
    await backToDraft(post._id, "Buffer didn't answer. Try again in a minute.");
    throw err;
  }
  res.redirect(303, `/c/${chorus._id}`);
});

pages.post("/c/:id/post/withdraw", async (req, res) => {
  const session = readSession(req);
  const chorus = await getChorus(req.params.id);
  if (!chorus) return notFound(res, session);
  if (!session) return res.redirect(303, "/login");
  const post = await claimForWithdraw(chorus._id, session.userId);
  if (!post?.bufferPostId) return res.redirect(303, `/c/${chorus._id}`);
  try {
    const problem = await deletePost(
      await getAccessToken(session.userId),
      post.bufferPostId,
    );
    if (problem) {
      await stillScheduled(post._id);
      return res.redirect(303, `/c/${chorus._id}`);
    }
  } catch (err) {
    await stillScheduled(post._id);
    throw err;
  }
  await backToDraft(post._id);
  res.redirect(303, `/c/${chorus._id}/post`);
});
