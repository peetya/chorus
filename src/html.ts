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
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(String(value));
}

// Escapes every value, so a page can't forget to. Nested html`` and arrays of it pass through as they are,
// and false, null and undefined render as nothing, so `${done && html`...`}` works.
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
};

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
  { viewer, script, signingIn }: PageOptions = {},
): string {
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="icon" href="/logo.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Sans:wght@400..700&family=JetBrains+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="/style.css">${[script ?? []].flat().map((file) => html`\n  <script src="/${file}" defer></script>`)}
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
