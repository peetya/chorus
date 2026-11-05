import express, { type Response, Router } from "express";
import { AI_USES, AiError, type Answer, aiEnabled, draftWithAi } from "./ai.ts";
import { readSession, type Session, signOut } from "./auth.ts";
import {
  ACCOUNT_QUERY,
  type Account,
  addNote,
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
  canCreate,
  chorusesById,
  createChorus,
  getChorus,
  isLive,
  isOver,
  isRelay,
  listOwned,
  openChorusOf,
  parseChorus,
  relaySlots,
} from "./choruses.ts";
import { deleteUserData, tokensGoOn } from "./cleanup.ts";
import { page } from "./html.ts";
import {
  addImage,
  addOwnImage,
  altProblem,
  type ChorusImage,
  claimImages,
  cropFor,
  deleteImages,
  IMAGE_PROBLEMS,
  imageFor,
  imageProblem,
  imagesIn,
  MAX_IMAGES,
  ownImageOf,
  parseFocus,
  pickedImage,
  removeImage,
  updateImage,
} from "./images.ts";
import { parseMessage, saveMessage } from "./messages.ts";
import {
  approvedByOthers,
  backToDraft,
  channelProblem,
  claimAiUse,
  claimCheck,
  claimForScheduling,
  claimForWithdraw,
  deletedInBuffer,
  draftScheduled,
  dueForCheck,
  findPost,
  giveAiUseBack,
  joinChorus,
  joinedBy,
  MAX_ANSWER,
  markDrafted,
  markFailed,
  markScheduled,
  markSent,
  nextSlot,
  othersIn,
  type Post,
  postsOf,
  saveAiDraft,
  saveText,
  stillScheduled,
  takeSlot,
} from "./posts.ts";
import { bufferCanFetch } from "./storage.ts";
import { waveDueAt } from "./time.ts";
import { getAccessToken, getUser, namesOf } from "./users.ts";
import { accountPage, deletedPage } from "./views/account.ts";
import { type ChorusView, chorusNotFound, chorusPage } from "./views/chorus.ts";
import { contactPage, sentPage, tooManyPage } from "./views/contact.ts";
import { formImageCard } from "./views/images.ts";
import { joinPage } from "./views/join.ts";
import { shortName } from "./views/labels.ts";
import { landingPage } from "./views/landing.ts";
import { liveMap } from "./views/map.ts";
import { myChoruses } from "./views/my-choruses.ts";
import { cantStart, newChorusForm } from "./views/new-chorus.ts";
import { privacyPage } from "./views/privacy.ts";
import {
  relayFinishedPage,
  relaySunPanel,
  relayWall,
  relayWallPage,
} from "./views/relay.ts";
import { reviewPage } from "./views/review.ts";
import { finishedPage, scheduled, wallList, wallPage } from "./views/wall.ts";
import { aiPage, checkList, writePage } from "./views/write.ts";

export const pages = Router();

function viewer(session: Session) {
  return { name: session.name, mock: isMock() };
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

pages.get("/", (req, res) => {
  const session = readSession(req);
  res.send(landingPage(session && viewer(session)));
});

pages.get("/contact", (req, res) => {
  const session = readSession(req);
  res.send(
    page("Contact", contactPage(), { viewer: session && viewer(session) }),
  );
});

pages.post(
  "/contact",
  express.urlencoded({ extended: false, limit: "16kb" }),
  async (req, res) => {
    const session = readSession(req);
    const options = { viewer: session && viewer(session) };
    // Only a bot fills in the hidden field. It gets the same answer, so it doesn't learn anything.
    if (req.body?.website)
      return res.send(page("Message sent", sentPage(), options));
    const { input, errors } = parseMessage(req.body ?? {});
    if (errors.length > 0) {
      return res
        .status(400)
        .send(page("Contact", contactPage(input, errors), options));
    }
    if (!(await saveMessage(input))) {
      return res.status(429).send(page("Contact", tooManyPage(), options));
    }
    res.send(page("Message sent", sentPage(), options));
  },
);

pages.get("/privacy", (req, res) => {
  const session = readSession(req);
  res.send(
    page("Privacy", privacyPage(), { viewer: session && viewer(session) }),
  );
});

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
  // A live Chorus's card shows its map, or a relay's sun path.
  const withPeople = await Promise.all(
    items.map(async (item) => {
      if (!isLive(item.chorus)) return item;
      const { joined, names } = await peopleIn(item.chorus);
      const people = scheduled(
        joined.map((post) => ({ name: names.get(post.userId) ?? "?", post })),
      );
      return { ...item, people };
    }),
  );
  res.send(
    page("My Choruses", myChoruses(withPeople), { viewer: viewer(session) }),
  );
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
  const othersJoined = await othersIn(
    owned.map((chorus) => chorus._id),
    session.userId,
  );
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

// The page that says why someone can't start a Chorus now, or null when they can.
async function startBlocked(session: Session) {
  const open = await openChorusOf(session.userId);
  if (canCreate() && !open) return null;
  return page("Start a Chorus", cantStart(canCreate() ? open : null), {
    viewer: viewer(session),
  });
}

// new-images.js uploads the images while the form is filled in.
const NEW_CHORUS_SCRIPTS = ["brief.js", "new-images.js", "focus.js"];

pages.get("/new", async (req, res) => {
  const session = readSession(req);
  if (!session) return res.redirect("/login?next=/new");
  const blocked = await startBlocked(session);
  if (blocked) return res.send(blocked);
  const images = await imagesIn({ ownerId: session.userId, chorusId: null });
  res.send(
    page("Start a Chorus", newChorusForm({}, [], images), {
      viewer: viewer(session),
      script: NEW_CHORUS_SCRIPTS,
    }),
  );
});

pages.post(
  "/new",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const session = readSession(req);
    if (!session) return res.redirect(303, "/login");
    const blocked = await startBlocked(session);
    if (blocked) return res.status(409).send(blocked);
    const { input, errors } = parseChorus(req.body ?? {});
    // The images were uploaded already; the form sends their descriptions.
    const images = (
      await imagesIn({ ownerId: session.userId, chorusId: null })
    ).map((image) => {
      const alt = req.body?.[`alt-${image.id}`];
      return typeof alt === "string" ? { ...image, alt: alt.trim() } : image;
    });
    images.forEach((image, i) => {
      const problem = altProblem(image.alt);
      if (problem) errors.push(`Image ${i + 1}: ${problem}`);
    });
    if (errors.length) {
      return res.status(400).send(
        page("Start a Chorus", newChorusForm(input, errors, images), {
          viewer: viewer(session),
          script: NEW_CHORUS_SCRIPTS,
        }),
      );
    }
    const chorus = await createChorus(session.userId, input);
    await claimImages(
      session.userId,
      chorus._id,
      new Map(images.map((image) => [image.id, image.alt])),
    );
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

async function chorusView(
  req: express.Request,
  session: Session | null,
  chorus: Chorus,
): Promise<ChorusView> {
  const { joined, names } = await peopleIn(chorus);
  return {
    chorus,
    organizer: names.get(chorus.ownerId) ?? "Someone",
    joined: joined.map((post) => ({
      name: names.get(post.userId) ?? "?",
      post,
    })),
    isOrganizer: session?.userId === chorus.ownerId,
    post: joined.find((post) => post.userId === session?.userId) ?? null,
    over: isOver(chorus),
    live: isLive(chorus),
    inviteUrl: `https://${req.get("host")}/c/${chorus._id}`,
  };
}

pages.get("/c/:id", async (req, res) => {
  const session = readSession(req);
  const chorus = await getChorus(req.params.id);
  if (!chorus) return notFound(res, session);
  // Drafts are checked before the day too, and late posts after it.
  await runDueChecks(chorus._id);
  const view = await chorusView(req, session, chorus);
  const { isOrganizer, over, live } = view;
  // From the day on everyone sees the wall. The organizer can still open the dashboard.
  const dashboard = isOrganizer && req.query.dashboard !== undefined;
  if (over && !dashboard) {
    const finished = isRelay(chorus) ? relayFinishedPage : finishedPage;
    return res.send(
      page(chorus.title, finished(view), {
        viewer: session && viewer(session),
        // Confetti, and the map or sun path drawing itself, only when something went out.
        script: view.joined.some(({ post }) => post.status === "sent")
          ? ["copy.js", "confetti.js", "intro.js"]
          : "copy.js",
      }),
    );
  }
  const wall = live && !dashboard;
  const livePage = isRelay(chorus) ? relayWallPage : wallPage;
  res.send(
    page(chorus.title, wall ? livePage(view) : chorusPage(view), {
      viewer: session && viewer(session),
      script: wall ? "wall.js" : isOrganizer ? "copy.js" : undefined,
    }),
  );
});

// A form post with the file in it. Response.formData() reads multipart without another package.
// null when there's no form to read.
async function readUpload(req: express.Request) {
  try {
    const form = await new Response(req.body, {
      headers: { "content-type": req.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    const data =
      file instanceof File
        ? Buffer.from(await file.arrayBuffer())
        : Buffer.alloc(0);
    return { form, data };
  } catch {
    return null;
  }
}

const upload = express.raw({ type: "multipart/form-data", limit: "4.5mb" });
const FULL = "A Chorus can have 4 images. Remove one first.";

// Images are added only on "Start a Chorus", like the rest of the brief, before the Chorus exists.
// new-images.js gets back the new image's card, focus.js the new crops, or a plain text message. The
// description is checked when the form is sent.
async function formImagesOf(
  req: express.Request,
  res: Response,
): Promise<{ ownerId: string; chorusId: null } | null> {
  const session = readSession(req);
  if (!session) {
    res.status(401).type("text").send("Sign in again to add images.");
    return null;
  }
  if (await startBlocked(session)) {
    res.status(409).type("text").send("You can't start a Chorus right now.");
    return null;
  }
  return { ownerId: session.userId, chorusId: null };
}

function sendCard(res: Response, image: ChorusImage, scope: ChorusImage[]) {
  const i = scope.findIndex((other) => other.id === image.id);
  res.type("html").send(formImageCard(image, i).value);
}

pages.post("/images", upload, async (req, res) => {
  const scope = await formImagesOf(req, res);
  if (!scope) return;
  if (!bufferCanFetch()) {
    return res
      .status(400)
      .type("text")
      .send(
        "Images need a Vercel Blob store: Buffer can't fetch them from this computer.",
      );
  }
  if ((await imagesIn(scope)).length >= MAX_IMAGES) {
    return res.status(400).type("text").send(FULL);
  }
  const sent = await readUpload(req);
  const problem = sent ? await imageProblem(sent.data) : "file";
  if (!sent || problem) {
    return res
      .status(400)
      .type("text")
      .send(IMAGE_PROBLEMS[problem ?? "file"]);
  }
  const image = await addImage(scope.ownerId, scope, sent.data, "", {
    x: 0.5,
    y: 0.5,
  });
  if (!image) return res.status(400).type("text").send(FULL);
  sendCard(res, image, await imagesIn(scope));
});

pages.post(
  "/images/:imageId",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const scope = await formImagesOf(req, res);
    if (!scope) return;
    const alt = typeof req.body?.alt === "string" ? req.body.alt.trim() : "";
    const focus = parseFocus(req.body?.focusX, req.body?.focusY);
    const image = await updateImage(scope, req.params.imageId, alt, focus);
    if (!image) return res.status(404).type("text").send("That image is gone.");
    res.json(image.urls);
  },
);

pages.post("/images/:imageId/remove", async (req, res) => {
  const scope = await formImagesOf(req, res);
  if (!scope) return;
  await removeImage(scope, req.params.imageId);
  res.sendStatus(204);
});

pages.get("/c/:id/wall", async (req, res) => {
  const chorus = await getChorus(req.params.id);
  if (!chorus) return res.sendStatus(404);
  if (isLive(chorus)) await runDueChecks(chorus._id);
  const { joined, names } = await peopleIn(chorus);
  const people = joined.map((post) => ({
    name: names.get(post.userId) ?? "?",
    post,
  }));
  if (isRelay(chorus)) {
    const part =
      "map" in req.query
        ? relaySunPanel(chorus, people)
        : relayWall(chorus, people);
    return res.type("html").send(part.value);
  }
  const part =
    "map" in req.query ? liveMap(scheduled(people)) : wallList(people);
  res.type("html").send(part.value);
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
    page(
      "Pick your channel",
      joinPage(
        chorus,
        channels,
        post?.channelId,
        (await imagesIn({ chorusId: chorus._id })).length > 0,
      ),
      {
        viewer: viewer(session),
      },
    ),
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
    const hasImages = (await imagesIn({ chorusId: chorus._id })).length > 0;
    const problem = channel
      ? channelProblem(channel, hasImages)
      : "Pick one of your channels.";
    if (!channel || problem) {
      return res.status(400).send(
        page(
          "Pick your channel",
          joinPage(
            chorus,
            channels,
            undefined,
            hasImages,
            problem ?? undefined,
          ),
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
    post.answers?.map((a) => a.answer),
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
      writePage(
        chorus,
        post,
        organizer,
        text,
        result,
        req.query.saved === "1",
        aiEnabled() ? { usesLeft: AI_USES - (post.aiUses ?? 0) } : null,
        req.query.drafted === "1",
        await imagesIn({ chorusId: chorus._id }),
        await ownImageOf(post._id),
        bufferCanFetch(),
        ownImageError(req.query.image),
      ),
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
    if (isOver(chorus)) return res.redirect(303, `/c/${chorus._id}`);
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    const post = await findPost(chorus._id, session.userId);
    // A draft is saved even when it's too long: the checks stop it at approval, not here.
    const saved = await saveText(
      chorus._id,
      session.userId,
      text,
      pickedImage(
        req.body?.image,
        await imagesIn({ chorusId: chorus._id }),
        post && (await ownImageOf(post._id)),
      ),
    );
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

// The person's own post that "Draft with AI" may write: signed in, joined and still drafting.
async function draftingPost(req: express.Request, res: Response) {
  const session = readSession(req);
  const chorus = await getChorus(String(req.params.id));
  if (!chorus) return notFound(res, session);
  if (!session) return res.redirect(303, `/login?next=/c/${chorus._id}/post`);
  const post = await findPost(chorus._id, session.userId);
  if (post?.status !== "drafting" || !aiEnabled()) {
    return res.redirect(303, `/c/${chorus._id}/post`);
  }
  return { session, chorus, post };
}

async function sendAiPage(
  res: Response,
  { session, chorus, post }: { session: Session; chorus: Chorus; post: Post },
  answers: Answer[],
  extra: { followUp?: string; error?: string } = {},
) {
  res
    .status(extra.error ? 400 : 200)
    .send(
      page(
        "Draft with AI",
        aiPage(
          chorus,
          post,
          await organizerName(chorus),
          answers,
          AI_USES - (post.aiUses ?? 0),
          extra.followUp,
          extra.error,
        ),
        { viewer: viewer(session), script: "ai.js" },
      ),
    );
}

pages.get("/c/:id/post/ai", async (req, res) => {
  const found = await draftingPost(req, res);
  if (!found || !("post" in found)) return;
  await sendAiPage(res, found, found.post.answers ?? []);
});

pages.post(
  "/c/:id/post/ai",
  express.urlencoded({ extended: false, limit: "16kb" }),
  async (req, res) => {
    const found = await draftingPost(req, res);
    if (!found || !("post" in found)) return;
    const { chorus, post } = found;
    const field = (value: unknown) =>
      typeof value === "string" ? value.trim().slice(0, MAX_ANSWER) : "";
    const given = [req.body?.answer ?? []].flat();
    const answers: Answer[] = chorus.questions.map((question, i) => ({
      question,
      answer: field(given[i]),
    }));
    const followUp = field(req.body?.followUp).slice(0, 300);
    const followUpAnswer = field(req.body?.followUpAnswer);
    if (followUp && followUpAnswer) {
      answers.push({ question: followUp, answer: followUpAnswer });
    }
    if (!answers.some((a) => a.answer)) {
      return sendAiPage(res, found, answers, {
        followUp,
        error: "Answer at least one question first.",
      });
    }
    if (!(await claimAiUse(post._id, AI_USES))) {
      return sendAiPage(res, found, answers, {
        error:
          "You've used all your AI tries for this Chorus. Write it yourself, the brief is next to the editor.",
      });
    }
    let result: Awaited<ReturnType<typeof draftWithAi>>;
    try {
      result = await draftWithAi(chorus, post.channelService, answers);
    } catch (err) {
      await giveAiUseBack(post._id);
      if (!(err instanceof AiError)) throw err;
      return sendAiPage(res, found, answers, { followUp, error: err.message });
    }
    const used = { ...post, aiUses: (post.aiUses ?? 0) + 1 };
    if ("followUp" in result) {
      return sendAiPage(res, { ...found, post: used }, answers, {
        followUp: result.followUp,
      });
    }
    await saveAiDraft(post._id, result.text, answers);
    res.redirect(303, `/c/${chorus._id}/post?drafted=1`);
  },
);

// The person's own image. The editor's buttons send the whole form here, so the text is saved too and
// nothing typed is lost. Problems go back to the editor as a code (see ownImageError).
const OWN_IMAGE_ERRORS: Record<string, string> = {
  ...IMAGE_PROBLEMS,
  alt: "Describe your image, for people who can't see it.",
  long: "Keep the description under 1,000 characters.",
};

function ownImageError(code: unknown): string | null {
  return (typeof code === "string" && OWN_IMAGE_ERRORS[code]) || null;
}

async function draftOf(req: express.Request, res: Response) {
  const session = readSession(req);
  const chorus = await getChorus(String(req.params.id));
  if (!chorus) return notFound(res, session);
  if (!session) return res.redirect(303, `/login?next=/c/${chorus._id}/post`);
  const post = await findPost(chorus._id, session.userId);
  if (post?.status !== "drafting" || isOver(chorus)) {
    return res.redirect(303, `/c/${chorus._id}`);
  }
  return { session, chorus, post };
}

pages.post("/c/:id/post/image", upload, async (req, res) => {
  const found = await draftOf(req, res);
  if (!found || !("post" in found)) return;
  const { chorus, post } = found;
  const back = (code?: string) =>
    res.redirect(
      303,
      `/c/${chorus._id}/post${code ? `?image=${code}` : "?saved=1"}`,
    );
  const sent = await readUpload(req);
  const field = (name: string) => {
    const value = sent?.form.get(name);
    return typeof value === "string" ? value : "";
  };
  await saveText(chorus._id, post.userId, field("text"));
  if (!bufferCanFetch()) return back();
  const problem = sent ? await imageProblem(sent.data) : "file";
  if (!sent || problem) return back(problem ?? "file");
  const alt = field("alt").trim();
  const altIssue = altProblem(alt);
  if (altIssue) return back(alt ? "long" : "alt");
  await addOwnImage(post, sent.data, alt);
  await saveText(chorus._id, post.userId, field("text"), "own");
  back();
});

pages.post(
  "/c/:id/post/image/remove",
  express.urlencoded({ extended: false, limit: "64kb" }),
  async (req, res) => {
    const found = await draftOf(req, res);
    if (!found || !("post" in found)) return;
    const { chorus, post } = found;
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    await deleteImages({ postId: post._id });
    // Back to the Chorus's images, counted from the start like a new person, or none.
    const images = await imagesIn({ chorusId: chorus._id });
    await saveText(chorus._id, post.userId, text, images.length ? 0 : null);
    res.redirect(303, `/c/${chorus._id}/post?saved=1`);
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
  const slot = isRelay(chorus) ? await nextSlot(chorus, post) : undefined;
  res.send(
    page(
      "Check your post",
      reviewPage(
        chorus,
        post,
        result,
        await imagesIn({ chorusId: chorus._id }),
        slot,
        await ownImageOf(post._id),
      ),
      {
        viewer: viewer(session),
        script: "review.js",
      },
    ),
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
    // A relay goes out in the relay's time zone, so the person's own doesn't matter.
    const zone = isRelay(chorus) ? undefined : req.body?.tz;
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

    let dueAt = waveDueAt(chorus.day, chorus.localTime, post.channelTz);
    if (isRelay(chorus)) {
      const slot = await takeSlot(chorus, post);
      // The relay is full. The review page says so.
      if (slot === null) {
        await backToDraft(post._id);
        return res.redirect(303, `/c/${chorus._id}/post/review`);
      }
      dueAt = relaySlots(chorus)[slot];
    }

    // The image as it is now. The Chorus's images can't change after the start, and the person's own
    // image only while they are drafting.
    const image = imageFor(
      await imagesIn({ chorusId: chorus._id }),
      post,
      await ownImageOf(post._id),
    );
    try {
      const accessToken = await getAccessToken(session.userId);
      const scheduled = await createPost(accessToken, {
        channelId: post.channelId,
        service: post.channelService,
        text: post.text ?? "",
        dueAt,
        aiAssisted: post.aiShaped,
        saveToDraft: asDraft,
        image: image
          ? {
              url: image.urls[cropFor(post.channelService, image)],
              alt: image.alt,
            }
          : undefined,
      });
      if (!scheduled.ok) {
        await backToDraft(post._id, scheduled.message);
        return res.redirect(303, `/c/${chorus._id}/post`);
      }
      const mark = asDraft ? markDrafted : markScheduled;
      await mark(post._id, scheduled.id, new Date(scheduled.dueAt));
      // So the person, or someone on their team, knows where the post came from before deleting it.
      await addNote(
        accessToken,
        scheduled.id,
        `This post is part of the Chorus "${chorus.title}". To change or withdraw it, open https://${req.get("host")}/c/${chorus._id}`,
      ).catch((err) => console.error(`Note failed for post ${post._id}:`, err));
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
  if (!session) return res.redirect(303, `/login?next=/c/${chorus._id}`);
  const post = await claimForWithdraw(chorus._id, session.userId);
  if (!post?.bufferPostId) return res.redirect(303, `/c/${chorus._id}`);
  const before = post.withdrawFrom ?? "scheduled";
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
