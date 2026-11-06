import { initials } from "./views/labels.ts";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// html`` below calls this for every value. Call it directly only outside html``.
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

// Markup that is already safe: built by html`` or written by us.
export class Html {
  value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

type Value = Html | string | number | boolean | null | undefined | Value[];

function render(value: Value): string {
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === null || value === undefined || typeof value === "boolean") {
    return "";
  }
  return escapeHtml(String(value));
}

// Escapes every value, so a page can't forget to. Nested html`` and arrays of it pass through as they are,
// and true, false, null and undefined render as nothing, so `${done && html`...`}` works and a stray
// `${done}` doesn't print "true".
export function html(strings: TemplateStringsArray, ...values: Value[]): Html {
  return new Html(
    strings[0] +
      values.map((value, i) => render(value) + strings[i + 1]).join(""),
  );
}

// Only for markup we wrote ourselves, like an icon. Never for anything a person or Buffer sent.
export function raw(markup: string): Html {
  return new Html(markup);
}

export type PageOptions = {
  viewer?: { name: string; mock?: boolean } | null; // who is signed in, for the header
  script?: string | string[]; // files in public/, for the few pages that need JS
  signingIn?: boolean; // the sign-in pages leave out the header's "Sign in" link to themselves
  description?: string; // for search results, and the card a shared link gets
  index?: boolean; // only public pages go in search results, never a Chorus or a person's own page
};

export const DESCRIPTION =
  "Announce news together. Everyone writes their own post, and it goes out from their own account at the same local time.";

// Discord, Slack and LinkedIn need the image's full address. Vercel sets the production domain on every
// deployment, previews too. On your own machine it stays a path.
function shareImage(): string {
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return `${domain ? `https://${domain}` : ""}/share.png`;
}

// The title, the description and the card a shared link gets. Also used by the landing page's own head.
export function headTags(
  title: string,
  description: string,
  index: boolean,
): Html {
  return html`<title>${title}</title>
  <meta name="description" content="${description}">${
    !index &&
    html`
  <meta name="robots" content="noindex">`
  }
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Chorus">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${shareImage()}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Chorus: a world map where posts go out as the morning reaches each city">
  <meta name="twitter:card" content="summary_large_image">`;
}

// Vercel Web Analytics counts visits without cookies. Vercel serves the script only on its deployments,
// so a local server leaves it out instead of asking for a file it doesn't have.
export function analytics(): Html {
  if (!process.env.VERCEL) return html``;
  return html`\n  <script src="/_vercel/insights/script.js" defer></script>`;
}

// The right side of the header, also on the landing page: the person's initials open a menu. It works
// without JS; menu.js only closes it on a click outside or Escape.
export function accountNav(viewer: PageOptions["viewer"]): Html {
  if (!viewer) return html`<a href="/login">Sign in</a>`;
  return html`<details class="menu">
        <summary class="avatar menu-avatar" aria-label="Menu for ${viewer.name}">${initials(viewer.name)}</summary>
        <div class="menu-panel">
          <p class="menu-who">Signed in as <strong>${viewer.name}${viewer.mock && " (mock mode)"}</strong></p>
          <a href="/me" class="menu-item">My Choruses</a>
          <a href="/account" class="menu-item">My account</a>
          <form method="post" action="/logout"><button type="submit" class="menu-item">Sign out</button></form>
        </div>
      </details>
      <script src="/menu.js" defer></script>`;
}

function header(viewer: PageOptions["viewer"], signingIn = false): Html {
  return html`<header class="top">
    <div>
      <a href="/" class="brand"><img src="/logo.svg" alt="" width="24" height="24"><span>chorus</span></a>
      <nav>
      ${!signingIn && accountNav(viewer)}
      </nav>
    </div>
  </header>`;
}

export function page(
  title: string,
  body: Html,
  {
    viewer,
    script,
    signingIn,
    description = DESCRIPTION,
    index = false,
  }: PageOptions = {},
): string {
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${headTags(`${title} · Chorus`, description, index)}
  <link rel="icon" href="/logo.svg" type="image/svg+xml">
  <link rel="preload" href="/fonts/instrument-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/style.css">${["your-time.js", script ?? []].flat().map((file) => html`\n  <script src="/${file}" defer></script>`)}${analytics()}
</head>
<body>
  ${header(viewer, signingIn)}
  <main>
${body}
  </main>
</body>
</html>
`.value;
}
