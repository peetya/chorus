import express, { type Response, Router } from "express";
import { readSession, type Session, signOut } from "./auth.ts";
import {
  ACCOUNT_QUERY,
  type Account,
  type Channel,
  createPost,
  deletePost,
  getChannels,
  getPost,
  graphql,
  isMock,
} from "./buffer.ts";
import { type CheckResult, checkPost } from "./checks.ts";
import {
  type Chorus,
  chorusesById,
  createChorus,
  getChorus,
  isLive,
  isOver,
  listOwned,
  parseChorus,
} from "./choruses.ts";
import { deleteUserData, tokensGoOn } from "./cleanup.ts";
import { page } from "./html.ts";
import {
  approvedByOthers,
  backToDraft,
  channelProblem,
  claimCheck,
  claimForScheduling,
  claimForWithdraw,
  deletedInBuffer,
  draftScheduled,
  dueForCheck,
  findPost,
  joinChorus,
  joinedBy,
  markDrafted,
  markFailed,
  markScheduled,
  markSent,
  type Post,
  postsOf,
  saveText,
  stillScheduled,
} from "./posts.ts";
import { waveDueAt } from "./time.ts";
import { dropTokens, getAccessToken, getUser, namesOf } from "./users.ts";
import { accountPage, deletedPage } from "./views/account.ts";
import { chorusNotFound, chorusPage } from "./views/chorus.ts";
import { joinPage } from "./views/join.ts";
import { shortName } from "./views/labels.ts";
import { myChoruses } from "./views/my-choruses.ts";
import { newChorusForm } from "./views/new-chorus.ts";
import { reviewPage } from "./views/review.ts";
import { finishedPage, wallList, wallPage } from "./views/wall.ts";
import { checkList, writePage } from "./views/write.ts";

export const pages = Router();

function viewer(session: Session) {
  return { name: isMock() ? `${session.name} (mock mode)` : session.name };
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

pages.get("/account", async (req, res) => {
  const session = readSession(req);
  if (!session) return res.redirect("/login?next=/account");
  const user = await getUser(session.userId);
  if (!user) {
    signOut(res);
    return res.redirect("/");
  }
  const mine = await joinedBy(session.userId);
  const owned = await listOwned(session.userId);
  const othersJoined = (
    await Promise.all(owned.map((chorus) => postsOf(chorus._id)))
  )
    .flat()
    .filter((post) => post.userId !== session.userId).length;
  res.send(
    page(
      "Account",
      accountPage({
        name: user.name,
        connected: Boolean(user.tokenEnc),
        tokensGoOn: await tokensGoOn(session.userId),
        scheduled: mine.filter((post) => post.status === "scheduled").length,
        othersJoined,
      }),
      { viewer: viewer(session) },
    ),
  );
});

pages.post("/account/disconnect", async (req, res) => {
  const session = readSession(req);
  if (!session) return res.redirect(303, "/login?next=/account");
  await dropTokens(session.userId);
  res.redirect(303, "/account");
});

pages.post(
  "/account/delete",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const session = readSession(req);
    if (!session) return res.redirect(303, "/login?next=/account");
    if (req.body?.confirm !== "yes") return res.redirect(303, "/account");
    await deleteUserData(session.userId);
    signOut(res);
    res.send(page("Your data is deleted", deletedPage()));
  },
);

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

// Asks Buffer about posts whose next check is due: scheduled posts after their time, and drafts now and
// then, to see if the person scheduled or posted them from Buffer. It runs when someone opens the Chorus,
// not on a cron, and each check is claimed first, so many viewers don't ask about one post many times.
async function runDueChecks(chorusId: string) {
  const due = await dueForCheck(chorusId);
  await Promise.all(
    due.map(async (post) => {
      if (!post.bufferPostId || !(await claimCheck(post))) return;
      try {
        const sent = await getPost(
          await getAccessToken(post.userId),
          post.bufferPostId,
        );
        if (!sent) {
          await deletedInBuffer(post._id, post.status);
        } else if (sent.status === "sent") {
          await markSent(post._id, sent.externalLink);
        } else if (
          post.status === "drafted" &&
          sent.status !== "draft" &&
          sent.status !== "error" &&
          sent.dueAt
        ) {
          await draftScheduled(post._id, new Date(sent.dueAt));
        } else if (sent.status === "error") {
          await markFailed(
            post._id,
            sent.error?.message ?? "Buffer couldn't send it.",
          );
        }
      } catch (err) {
        // The wall still loads; the next check asks again.
        console.error(`Status check failed for post ${post._id}:`, err);
      }
    }),
  );
}

async function peopleIn(chorus: Chorus) {
  const joined = await postsOf(chorus._id);
  const names = await namesOf([
    chorus.ownerId,
    ...joined.map((post) => post.userId),
  ]);
  return { joined, names };
}

pages.get("/c/:id", async (req, res) => {
  const session = readSession(req);
  const chorus = await getChorus(req.params.id);
  if (!chorus) return notFound(res, session);
  const live = isLive(chorus);
  const over = isOver(chorus);
  // Drafts are checked before the day too, and late posts after it.
  await runDueChecks(chorus._id);
  const { joined, names } = await peopleIn(chorus);
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
    over,
    live,
    inviteUrl: `https://${req.get("host")}/c/${chorus._id}`,
  };
  // From the day on everyone sees the wall. The organizer can still open the dashboard.
  const dashboard = isOrganizer && req.query.dashboard !== undefined;
  if (over && !dashboard) {
    return res.send(
      page(chorus.title, finishedPage(view), {
        viewer: session && viewer(session),
        script: "copy.js",
      }),
    );
  }
  const wall = live && !dashboard;
  res.send(
    page(chorus.title, wall ? wallPage(view) : chorusPage(view), {
      viewer: session && viewer(session),
      script: wall ? "wall.js" : isOrganizer ? "copy.js" : undefined,
    }),
  );
});

pages.get("/c/:id/wall", async (req, res) => {
  const chorus = await getChorus(req.params.id);
  if (!chorus) return res.sendStatus(404);
  if (isLive(chorus)) await runDueChecks(chorus._id);
  const { joined, names } = await peopleIn(chorus);
  res
    .type("html")
    .send(
      wallList(
        joined.map((post) => ({ name: names.get(post.userId) ?? "?", post })),
      ).value,
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

// The checks for one person's text: the brief, and the posts others in the Chorus already approved.
async function checksFor(
  chorus: Chorus,
  post: Post,
  text: string,
): Promise<CheckResult> {
  const approved = await approvedByOthers(chorus._id, post.userId);
  const names = await namesOf([
    chorus.ownerId,
    ...approved.map((other) => other.userId),
  ]);
  return checkPost(
    text,
    chorus,
    post.channelService,
    shortName(names.get(chorus.ownerId) ?? "the organizer"),
    approved.map((other) => ({
      name: shortName(names.get(other.userId) ?? "someone"),
      text: other.text ?? "",
    })),
  );
}

// Buffer's channel time zone, or one the person picked. Only real IANA names like "Asia/Tokyo".
function validZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
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
  const result = await checksFor(chorus, post, text);
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
    res.type("html").send(checkList(await checksFor(chorus, post, text)).value);
  },
);

pages.get("/c/:id/post/review", async (req, res) => {
  const session = readSession(req);
  const chorus = await getChorus(req.params.id);
  if (!chorus) return notFound(res, session);
  if (!session) return res.redirect(`/login?next=/c/${chorus._id}/post`);
  const post = await findPost(chorus._id, session.userId);
  if (post?.status !== "drafting") return res.redirect(`/c/${chorus._id}`);
  const result = await checksFor(chorus, post, post.text ?? "");
  res.send(
    page("Check your post", reviewPage(chorus, post, result), {
      viewer: viewer(session),
      script: "review.js",
    }),
  );
});

pages.post(
  "/c/:id/post/approve",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const session = readSession(req);
    const chorus = await getChorus(req.params.id);
    if (!chorus) return notFound(res, session);
    if (!session) return res.redirect(303, `/login?next=/c/${chorus._id}/post`);
    if (isOver(chorus)) return res.redirect(303, `/c/${chorus._id}`);
    const zone = req.body?.tz;
    if (zone !== undefined && !validZone(zone)) {
      return res.redirect(303, `/c/${chorus._id}/post/review`);
    }
    // Only one request gets the post. A double click finds it taken and just shows the Chorus.
    const post = await claimForScheduling(chorus._id, session.userId, zone);
    if (!post) return res.redirect(303, `/c/${chorus._id}`);
    const asDraft = req.body?.as === "draft";

    // The saved text is checked again here: the review page could be old, or skipped.
    const result = await checksFor(chorus, post, post.text ?? "");
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
        saveToDraft: asDraft,
      });
      if (!scheduled.ok) {
        await backToDraft(post._id, scheduled.message);
        return res.redirect(303, `/c/${chorus._id}/post`);
      }
      const mark = asDraft ? markDrafted : markScheduled;
      await mark(post._id, scheduled.id, new Date(scheduled.dueAt));
    } catch (err) {
      // Known limit: if Buffer created the post but its answer got lost, trying again makes a second
      // post. The status checks on the live wall are where that would show up.
      await backToDraft(
        post._id,
        "Buffer didn't answer. Try again in a minute.",
      );
      throw err;
    }
    res.redirect(303, `/c/${chorus._id}`);
  },
);

pages.post("/c/:id/post/withdraw", async (req, res) => {
  const session = readSession(req);
  const chorus = await getChorus(req.params.id);
  if (!chorus) return notFound(res, session);
  if (!session) return res.redirect(303, "/login");
  const post = await claimForWithdraw(chorus._id, session.userId);
  if (!post?.bufferPostId) return res.redirect(303, `/c/${chorus._id}`);
  const before = post.status === "drafted" ? "drafted" : "scheduled";
  try {
    const problem = await deletePost(
      await getAccessToken(session.userId),
      post.bufferPostId,
    );
    if (problem) {
      await stillScheduled(post._id, before);
      return res.redirect(303, `/c/${chorus._id}`);
    }
  } catch (err) {
    await stillScheduled(post._id, before);
    throw err;
  }
  await backToDraft(post._id);
  res.redirect(303, `/c/${chorus._id}/post`);
});
