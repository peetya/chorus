import {
  accountNav,
  analytics,
  DESCRIPTION,
  headTags,
  html,
  type PageOptions,
} from "../html.ts";

// The landing page has its own head (the description, landing.js) and the dark hero around the header, so it
// doesn't use page(). It's rendered here, not served from public/, so the header knows who is signed in.
export function landingPage(viewer: PageOptions["viewer"]): string {
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${headTags("Chorus: announce it together, each in your own words", DESCRIPTION, true)}
  <link rel="icon" href="/logo.svg" type="image/svg+xml">
  <link rel="preload" href="/fonts/instrument-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/style.css">
  <script src="/landing.js" defer></script>${analytics()}
</head>
<body>
  <div class="landing">
  <header class="top">
    <div>
      <a href="/" class="brand"><img src="/logo.svg" alt="" width="24" height="24"><span>chorus</span></a>
      <nav>
        <a href="#why" class="page-link">Why</a>
        <a href="#how" class="page-link">How it works</a>
        <a href="#trust" class="page-link">Privacy</a>
        ${accountNav(viewer)}
      </nav>
    </div>
  </header>
  <main class="landing-hero">
    <div class="hero">
      <h1>Announce it together, each in your own words.</h1>
      <p>Everyone writes their own post and shares it from their own account. Each post goes out at the same local time where that person is, so the news travels around the world with the morning.</p>
      <div class="hero-actions">
        <a href="/new" class="button primary">Start a Chorus</a>
        <a href="#how" class="button ghost">See how it works</a>
      </div>
      <p class="hero-note">Free to use. You sign in with Buffer, and its free plan is enough.</p>
    </div>
    <div class="map-frame hero-map">
      <img src="/world.svg" alt="">
      <!-- A still frame with six cities lit. landing.js moves it, unless the reader asked for less motion. -->
      <svg viewBox="0 0 360 144" role="img" aria-label="World map. A band of morning light moves slowly west. When it reaches a person, their post goes out and a small chat bubble appears above them.">
        <defs>
          <path id="bubble" d="M116.5 4C52.3 4 0 45.3 0 96c0 28.6 16.7 55.2 45.9 72.9 4.5 2.7 7.6 7.3 8.6 12.5 2.9 16-1 32.9-6.8 47.6 19.2-9.1 39.1-23.2 54.8-36.6 3.9-3.3 9.1-4.7 14.1-4.4C180.8 188 233 146.7 233 96 233 45.3 180.8 4 116.5 4z"/>
          <filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.4"/></filter>
          <clipPath id="map-edge"><rect width="360" height="144"/></clipPath>
        </defs>
        <g clip-path="url(#map-edge)"><g class="hero-band" style="transform: translateX(104px)"><path filter="url(#soft)" fill="rgba(251,146,60,0.16)" d="M32.4 144L40 138.3L50 125.2L60 102.3L70 71.5L80 46.5L90 31.8L100 23.4L110 18.4L120 15.3L130 13.3L140 12.2L150 11.6L160 11.5L170 12L180 13L190 14.8L200 17.7L210 22.2L220 29.7L230 42.8L240 65.7L250 96.5L260 121.5L270 136.2L279.3 144Z"/><path fill="none" stroke="rgba(251,146,60,0.6)" stroke-width="0.5" stroke-dasharray="1.5 1.5" d="M32.4 144L40 138.3L50 125.2L60 102.3L70 71.5L80 46.5L90 31.8L100 23.4L110 18.4L120 15.3"/></g></g>
        <g fill="#131829" stroke="#C8CEDA" stroke-width="0.7"><circle cx="354.8" cy="120.8" r="2.2"/><circle cx="331.2" cy="117.9" r="2.2"/><circle cx="319.7" cy="48.3" r="2.2"/><circle cx="257.6" cy="71" r="2.2"/><circle cx="183.4" cy="77.5" r="2.2"/><circle cx="199" cy="36.5" r="2.2"/><circle cx="179.9" cy="32.5" r="2.2"/><circle cx="170.9" cy="45.3" r="2.2"/><circle cx="133.4" cy="107.6" r="2.2"/><circle cx="106" cy="43.3" r="2.2"/><circle cx="80.9" cy="64.6" r="2.2"/><circle cx="57.6" cy="46.2" r="2.2"/></g>
        <!-- Auckland, Sydney, Tokyo, Bengaluru, Lagos, Budapest, London, Lisbon, São Paulo, New York, Mexico City,
             San Francisco. data-at is the point in the loop where the morning reaches the city. -->
        <g class="hero-dot lit" data-at="0.0282" style="transform-origin: 354.8px 120.8px"><circle cx="354.8" cy="120.8" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="354.8" cy="120.8" r="2.6" fill="#FCD34D"/><use href="#bubble" fill="#FCD34D" transform="translate(353.88 109.16) scale(0.036)"/></g>
        <g class="hero-dot lit" data-at="0.0748" style="transform-origin: 331.2px 117.9px"><circle cx="331.2" cy="117.9" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="331.2" cy="117.9" r="2.6" fill="#FCD34D"/><use href="#bubble" fill="#FCD34D" transform="translate(330.28 106.26) scale(0.036)"/></g>
        <g class="hero-dot lit" data-at="0.145" style="transform-origin: 319.7px 48.3px"><circle cx="319.7" cy="48.3" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="319.7" cy="48.3" r="2.6" fill="#FCD34D"/><use href="#bubble" fill="#FCD34D" transform="translate(318.78 36.66) scale(0.036)"/></g>
        <g class="hero-dot lit" data-at="0.2441" style="transform-origin: 257.6px 71px"><circle cx="257.6" cy="71" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="257.6" cy="71" r="2.6" fill="#FCD34D"/><use href="#bubble" fill="#FCD34D" transform="translate(256.68 59.36) scale(0.036)"/></g>
        <g class="hero-dot lit" data-at="0.3789" style="transform-origin: 183.4px 77.5px"><circle cx="183.4" cy="77.5" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="183.4" cy="77.5" r="2.6" fill="#FCD34D"/><use href="#bubble" fill="#FCD34D" transform="translate(182.48 65.86) scale(0.036)"/></g>
        <g class="hero-dot lit" data-at="0.3847" style="transform-origin: 199px 36.5px"><circle cx="199" cy="36.5" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="199" cy="36.5" r="2.6" fill="#FCD34D"/><use href="#bubble" fill="#FCD34D" transform="translate(198.08 24.86) scale(0.036)"/></g>
        <g class="hero-dot" data-at="0.4254" style="transform-origin: 179.9px 32.5px"><circle cx="179.9" cy="32.5" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="179.9" cy="32.5" r="2.6" fill="#FCD34D"/><use href="#bubble" fill="#FCD34D" transform="translate(178.98 20.86) scale(0.036)"/></g>
        <g class="hero-dot" data-at="0.426" style="transform-origin: 170.9px 45.3px"><circle cx="170.9" cy="45.3" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="170.9" cy="45.3" r="2.6" fill="#FCD34D"/><use href="#bubble" fill="#FCD34D" transform="translate(169.98 33.66) scale(0.036)"/></g>
        <g class="hero-dot" data-at="0.4529" style="transform-origin: 133.4px 107.6px"><circle cx="133.4" cy="107.6" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="133.4" cy="107.6" r="2.6" fill="#FCD34D"/><use href="#bubble" fill="#FCD34D" transform="translate(132.48 95.96) scale(0.036)"/></g>
        <g class="hero-dot" data-at="0.5499" style="transform-origin: 106px 43.3px"><circle cx="106" cy="43.3" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="106" cy="43.3" r="2.6" fill="#FCD34D"/><use href="#bubble" fill="#FCD34D" transform="translate(105.08 31.66) scale(0.036)"/></g>
        <g class="hero-dot" data-at="0.5793" style="transform-origin: 80.9px 64.6px"><circle cx="80.9" cy="64.6" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="80.9" cy="64.6" r="2.6" fill="#FCD34D"/><use href="#bubble" fill="#FCD34D" transform="translate(79.98 52.96) scale(0.036)"/></g>
        <g class="hero-dot" data-at="0.6366" style="transform-origin: 57.6px 46.2px"><circle cx="57.6" cy="46.2" r="5.2" fill="rgba(252,211,77,0.22)"/><circle cx="57.6" cy="46.2" r="2.6" fill="#FCD34D"/><use href="#bubble" fill="#FCD34D" transform="translate(56.68 34.56) scale(0.036)"/></g>
      </svg>
    </div>
  </main>
  </div>
  <section id="why" class="landing-section">
    <div class="why">
      <div class="why-intro">
        <h2 class="landing-title">Launch day usually looks like this</h2>
        <p class="landing-text">You ship something you're proud of. The company account posts it. Then this lands in the team chat:</p>
        <figure class="chat" aria-label="Example team chat message">
          <div class="chat-message">
            <span class="chat-avatar">LN</span>
            <div class="chat-body">
              <p class="chat-head"><strong>Lena</strong><span class="chat-time">9:02 AM</span></p>
              <p class="chat-text">We're live!! Please share the announcement post, it really helps <span class="chat-link">linkedin.com/posts/northwind-tally-2</span></p>
              <div class="chat-preview"><span class="chat-preview-site">LinkedIn</span><span class="chat-preview-title">Northwind on LinkedIn: Tally 2.0 is out today</span></div>
              <div class="chat-reactions"><span class="chat-reaction mine">👍 14</span><span class="chat-reaction">🎉 9</span><span class="chat-reaction">🚀 6</span></div>
              <p class="chat-thread"><span class="chat-replies">3 replies</span><span class="chat-time">Last reply today at 9:40 AM</span></p>
            </div>
          </div>
        </figure>
      </div>
      <ol class="problems">
        <li class="problem"><span class="num">01</span><span class="problem-text"><strong class="problem-title">Reposts are quiet</strong><span>A repost with nothing of your own in it feels empty. Most people skip it, and the ones who do it add little.</span></span></li>
        <li class="problem"><span class="num">02</span><span class="problem-text"><strong class="problem-title">Copy-paste looks fake</strong><span>When twenty people post the same sentence, it reads like a campaign, not like people who care.</span></span></li>
        <li class="problem"><span class="num">03</span><span class="problem-text"><strong class="problem-title">Nobody knows what to say</strong><span>People want to help, but a blank post box is hard. So the organizer ends up chasing everyone in chat.</span></span></li>
      </ol>
    </div>
    <div class="turn">
      <img src="/logo.svg" alt="" width="88" height="88">
      <p class="turn-title">Chorus turns it around. One link, and everyone posts the news <mark class="turn-mark">in their own words</mark>, <mark class="turn-mark">from their own account</mark>.</p>
      <p class="landing-text">So it reaches each person's followers through someone they actually follow.</p>
    </div>
  </section>

  <section id="how" class="landing-section">
    <h2 class="landing-title">How it works</h2>
    <ol class="steps">
      <li class="step"><span class="num">01</span><h3 class="step-title">Write the facts once</h3><p class="landing-text">What happened, the link, and the few claims everyone can make. That's the fact card.</p></li>
      <li class="step"><span class="num">02</span><h3 class="step-title">Everyone writes their own post</h3><p class="landing-text">Each person gets the facts and a few questions to think about, then writes in their own words. Stuck? They can ask AI for a first draft, built from their own answers.</p></li>
      <li class="step"><span class="num">03</span><h3 class="step-title">It goes out at their time</h3><p class="landing-text">Each post waits in that person's own scheduling queue and goes out at the same local time where they are, a few minutes apart. You watch the news travel around the world. All in one city? Pick a relay: one voice after another through the day.</p></li>
    </ol>
  </section>

  <section id="trust" class="landing-section trust">
    <div class="trust-intro">
      <h2 class="landing-title">Nobody posts for anyone else</h2>
      <p class="landing-text">Same news, many real voices. Not one message pasted a hundred times.</p>
    </div>
    <ul class="promises">
      <li class="promise"><svg class="check" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="#FFF1E8"/><path d="M6.5 11.2l3 3 6-6.4" fill="none" stroke="#C2410C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Each person approves their own post, and it goes out from their own account.</span></li>
      <li class="promise"><svg class="check" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="#FFF1E8"/><path d="M6.5 11.2l3 3 6-6.4" fill="none" stroke="#C2410C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>As the organizer you see who is ready. You never see anyone's post before it goes out.</span></li>
      <li class="promise"><svg class="check" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="#FFF1E8"/><path d="M6.5 11.2l3 3 6-6.4" fill="none" stroke="#C2410C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>The account you sign in with is used only to schedule your post and check that it went out. Chorus forgets it a day after the Chorus is over.</span></li>
      <li class="promise"><svg class="check" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="#FFF1E8"/><path d="M6.5 11.2l3 3 6-6.4" fill="none" stroke="#C2410C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>A post that is almost the same as someone else's is stopped, so every post really is different. And they go out over a day, not in the same second.</span></li>
    </ul>
  </section>

  <section class="landing-section">
    <div class="cta">
      <div class="cta-text">
        <h2 class="landing-title">Shipping something soon?</h2>
        <p class="landing-text">Free for you and everyone who joins. Set it up in two minutes and share one link.</p>
      </div>
      <a href="/new" class="button primary">Start a Chorus</a>
    </div>
  </section>

  <footer class="site-footer">
    <span>startchorus.com · ${new Date().getFullYear()}</span>
    <span><a href="/contact" class="footer-link">Contact</a> · <a href="/privacy" class="footer-link">Privacy</a></span>
    <span>Built with ❤️ and <a href="https://github.com/peetya/chorus" class="footer-link" target="_blank" rel="noopener">in the open</a></span>
  </footer>
</body>
</html>
`.value;
}
