import type { Chorus } from "../choruses.ts";
import { type Html, html, raw } from "../html.ts";
import { showDay } from "./labels.ts";
import { timing } from "./when.ts";

export function signInProblem(message: string): Html {
  return html`<h1>Sign in</h1>
<p>${message}</p>
<p><a href="/login/buffer">Try again</a></p>`;
}

const CHECK = raw(
  `<svg class="check" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="#FFF1E8"/><path d="M6.5 11.2l3 3 6-6.4" fill="none" stroke="#C2410C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
);

// The landing map's still frame: morning has reached six cities. Only the light is clipped at the map's
// edge, so the bubbles look the same everywhere, even Auckland's at the right edge.
const MORNING = raw(
  `<svg viewBox="0 0 360 144" aria-hidden="true">
  <defs>
    <path id="bubble" d="M116.5 4C52.3 4 0 45.3 0 96c0 28.6 16.7 55.2 45.9 72.9 4.5 2.7 7.6 7.3 8.6 12.5 2.9 16-1 32.9-6.8 47.6 19.2-9.1 39.1-23.2 54.8-36.6 3.9-3.3 9.1-4.7 14.1-4.4C180.8 188 233 146.7 233 96 233 45.3 180.8 4 116.5 4z"/>
    <filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.4"/></filter>
    <clipPath id="map-edge"><rect width="360" height="144"/></clipPath>
  </defs>
  <g clip-path="url(#map-edge)"><g transform="translate(104 0)"><path filter="url(#soft)" fill="rgba(251,146,60,0.16)" d="M32.4 144L40 138.3L50 125.2L60 102.3L70 71.5L80 46.5L90 31.8L100 23.4L110 18.4L120 15.3L130 13.3L140 12.2L150 11.6L160 11.5L170 12L180 13L190 14.8L200 17.7L210 22.2L220 29.7L230 42.8L240 65.7L250 96.5L260 121.5L270 136.2L279.3 144Z"/><path fill="none" stroke="rgba(251,146,60,0.6)" stroke-width="0.5" stroke-dasharray="1.5 1.5" d="M32.4 144L40 138.3L50 125.2L60 102.3L70 71.5L80 46.5L90 31.8L100 23.4L110 18.4L120 15.3"/></g></g>
  <g fill="#131829" stroke="#C8CEDA" stroke-width="0.7"><circle cx="354.8" cy="120.8" r="2.2"/><circle cx="331.2" cy="117.9" r="2.2"/><circle cx="319.7" cy="48.3" r="2.2"/><circle cx="257.6" cy="71" r="2.2"/><circle cx="183.4" cy="77.5" r="2.2"/><circle cx="199" cy="36.5" r="2.2"/><circle cx="179.9" cy="32.5" r="2.2"/><circle cx="170.9" cy="45.3" r="2.2"/><circle cx="133.4" cy="107.6" r="2.2"/><circle cx="106" cy="43.3" r="2.2"/><circle cx="80.9" cy="64.6" r="2.2"/><circle cx="57.6" cy="46.2" r="2.2"/></g>
  <g fill="#FCD34D">
    <circle cx="354.8" cy="120.8" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="354.8" cy="120.8" r="2.6"/><use href="#bubble" transform="translate(353.88 109.16) scale(0.036)"/>
    <circle cx="331.2" cy="117.9" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="331.2" cy="117.9" r="2.6"/><use href="#bubble" transform="translate(330.28 106.26) scale(0.036)"/>
    <circle cx="319.7" cy="48.3" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="319.7" cy="48.3" r="2.6"/><use href="#bubble" transform="translate(318.78 36.66) scale(0.036)"/>
    <circle cx="257.6" cy="71" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="257.6" cy="71" r="2.6"/><use href="#bubble" transform="translate(256.68 59.36) scale(0.036)"/>
    <circle cx="183.4" cy="77.5" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="183.4" cy="77.5" r="2.6"/><use href="#bubble" transform="translate(182.48 65.86) scale(0.036)"/>
    <circle cx="199" cy="36.5" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="199" cy="36.5" r="2.6"/><use href="#bubble" transform="translate(198.08 24.86) scale(0.036)"/>
  </g>
</svg>`,
);

// One card per scheduling tool Chorus works with. For now that's only Buffer. `joining` is the Chorus
// when someone came from its invite link.
export function signInPage(next: string, joining: Chorus | null = null): Html {
  const query = next === "/me" ? "" : `?next=${encodeURIComponent(next)}`;
  return html`<div class="sign-in">
<div class="sign-in-form">
  ${
    joining &&
    html`<p class="note joining">
    <img src="/logo.svg" alt="" width="32" height="32">
    <span><span class="muted">You're joining</span> <strong>${joining.title}</strong> <span class="muted">On ${showDay(joining.day)}, ${timing(joining)}</span></span>
  </p>`
  }
  <h1>Sign in with your scheduling tool</h1>
  <p class="sign-in-lead">Chorus doesn't post for you. Your post waits in your own scheduling queue and goes out from your own account.</p>
  <section class="provider" aria-labelledby="provider-buffer">
    <div class="provider-head">
      <h2 id="provider-buffer" class="provider-name">Buffer</h2>
      <span class="provider-free">Free plan is enough</span>
    </div>
    <p class="provider-text">Schedules posts to LinkedIn, Instagram, Threads, Bluesky, Mastodon, X and Facebook.</p>
    <a href="/login/buffer${query}" class="button primary big provider-button">Continue with Buffer</a>
  </section>
  <p class="hint">No Buffer account yet? <a href="https://buffer.com/">Create a free one</a> and connect the social account you want to post from. Then come back here.</p>
  <ul class="promises">
    <li class="promise">${CHECK}<span>Nothing is scheduled until you approve your post.</span></li>
    <li class="promise">${CHECK}<span>Buffer asks you to allow Chorus. You can remove it any time, on your account page or in Buffer.</span></li>
  </ul>
  <p class="hint">Chorus is an independent project. It works with Buffer's public API, but it isn't made or supported by Buffer. <a href="/privacy">How Chorus handles your data</a>.</p>
</div>
<div class="sign-in-map" aria-hidden="true">
  <div class="map-frame">
    <img src="/world.svg" alt="">
    ${MORNING}
  </div>
</div>
</div>`;
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
