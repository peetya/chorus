import { type Html, html } from "../html.ts";

export function signInProblem(message: string): Html {
  return html`<h1>Sign in</h1>
<p>${message}</p>
<p><a href="/login">Try again</a></p>`;
}

export function mockSignIn(
  people: { id: string; name: string; city: string }[],
  next: string,
): Html {
  return html`<h1>Sign in as</h1>
<p>Mock mode: these people are fake, and nothing reaches Buffer.</p>
<form method="post" action="/login/mock">
<input type="hidden" name="next" value="${next}">
<ul class="people">
${people.map((p) => html`<li><button type="submit" name="person" value="${p.id}">${p.name}, ${p.city}</button></li>\n`)}
</ul>
</form>`;
}
