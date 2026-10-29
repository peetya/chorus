const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Every value from a person or from Buffer goes through this before it reaches a page.
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export type PageOptions = {
  viewer?: { name: string } | null; // who is signed in, for the header
  script?: string; // a file in public/, for the few pages that need JS
};

function header(viewer: PageOptions["viewer"]): string {
  const nav = viewer
    ? `<a href="/me">My Choruses</a>
      <span class="who">${escapeHtml(viewer.name)}</span>
      <form method="post" action="/logout"><button type="submit" class="link">Sign out</button></form>`
    : '<a href="/login">Sign in</a>';
  return `<header class="top">
    <div>
      <a href="/" class="brand"><img src="/logo.svg" alt="" width="24" height="24"><span>chorus</span></a>
      <nav>
      ${nav}
      </nav>
    </div>
  </header>`;
}

// body is trusted markup: escape the values inside it first.
export function page(
  title: string,
  body: string,
  { viewer, script }: PageOptions = {},
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/logo.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Sans:wght@400..700&family=JetBrains+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="/style.css">${script ? `\n  <script src="/${script}" defer></script>` : ""}
</head>
<body>
  ${header(viewer)}
  <main>
${body}
  </main>
</body>
</html>
`;
}
