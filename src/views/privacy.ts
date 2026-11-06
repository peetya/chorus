import { type Html, html } from "../html.ts";

// Keep it true to the code: the times come from cleanup.ts, messages.ts and the cookies in auth.ts.
export function privacyPage(): Html {
  return html`<article class="privacy">
<h1>Privacy</h1>
<p class="muted">November 2026</p>

<h2 class="sub-title">Who runs Chorus</h2>
<p>Chorus is a one-person project by Péter Halász, in Hungary. It works with Buffer's public API, but it isn't made or supported by Buffer. For anything about your data, write through the <a href="/contact">contact form</a>.</p>

<h2 class="sub-title">What Chorus keeps</h2>
<ul>
  <li>When you sign in with Buffer: your Buffer account's id and name, and the keys that let Chorus schedule your post (Buffer's access and refresh tokens, encrypted with AES-256-GCM).</li>
  <li>When you join a Chorus: the channel you picked (its name, network and time zone), your post, the image you add to it, and whether it went out. If you use "Draft with AI", your answers to the questions too.</li>
  <li>When you start a Chorus: the brief you write and the images you upload.</li>
  <li>When you use the contact form: your email and your message.</li>
</ul>
<p>Nobody else sees your post before it goes out, the organizer neither.</p>

<h2 class="sub-title">For how long</h2>
<ul>
  <li>Your post's text and your AI answers: deleted a day after the Chorus is over.</li>
  <li>The Buffer keys: deleted a day after your last Chorus is over, or a day after you signed in if you're in none.</li>
  <li>Images: deleted a day after the Chorus is over, once no post still needs them.</li>
  <li>The finished wall stays public, as the record of the Chorus: your first name and initial, the network, the time zone, the time, and the link to your real post.</li>
  <li>Your account (the id and name): until you delete it.</li>
  <li>Contact messages: 6 months.</li>
</ul>

<h2 class="sub-title">Who else handles it</h2>
<ul>
  <li><strong>Buffer</strong> schedules your post in your own Buffer account. Buffer's own privacy policy covers that account.</li>
  <li><strong>OpenAI</strong>, only when you click "Draft with AI": your answers and the brief go to OpenAI, which writes a first draft. OpenAI doesn't train its models on this, and keeps it for up to 30 days.</li>
  <li><strong>MongoDB Atlas</strong> holds the database, in Frankfurt.</li>
  <li><strong>Vercel</strong> runs the site, in Frankfurt, and keeps short request logs. Images are stored with Vercel Blob, at links that are hard to guess but public, because Buffer has to fetch them. Vercel Web Analytics counts the visits: the page, the country, the browser and the site you came from. It uses no cookies and doesn't know who you are.</li>
</ul>

<h2 class="sub-title">Cookies</h2>
<p>One cookie keeps you signed in, for up to 30 days. Another one lives for 10 minutes while you sign in. No ads, and counting the visits needs no cookie.</p>

<h2 class="sub-title">Your choices</h2>
<ul>
  <li>On your <a href="/account">account page</a> you can delete your data right away. To end Chorus's access to Buffer sooner, remove Chorus in your Buffer settings. Posts already in your Buffer queue stay there, so remove them in Buffer if you want.</li>
  <li>You can ask to see, correct or delete what Chorus keeps about you through the <a href="/contact">contact form</a>.</li>
  <li>You can also complain to the Hungarian data protection authority (<a href="https://naih.hu/">NAIH</a>).</li>
</ul>
</article>`;
}
