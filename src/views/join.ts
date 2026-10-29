import type { Channel } from "../buffer.ts";
import type { Chorus } from "../choruses.ts";
import { type Html, html } from "../html.ts";
import { channelProblem } from "../posts.ts";
import { place, serviceName } from "./labels.ts";

export function joinPage(
  chorus: Chorus,
  channels: Channel[],
  chosen: string | undefined,
  error?: string,
): Html {
  const usable = channels.filter((channel) => !channelProblem(channel));
  const selected = chosen ?? usable[0]?.id;
  const options = channels.map((channel) => {
    const problem = channelProblem(channel);
    return html`<label class="channel${problem && " blocked"}">
  <input type="radio" name="channelId" value="${channel.id}"${channel.id === selected && !problem && " checked"}${problem && " disabled"}>
  <span class="channel-text">
    <span class="channel-name">${channel.name}</span>
    <span class="muted">${serviceName(channel.service)} · ${place(channel.timezone)} time</span>
    ${problem && html`<span class="channel-problem">${problem}</span>`}
  </span>
</label>`;
  });

  return html`<div class="page-head">
  <a href="/c/${chorus._id}" class="back">${chorus.title}</a>
  <h1>Pick your channel</h1>
  <p class="muted">Your post goes out from this channel at ${chorus.localTime}, in the channel's time zone.</p>
</div>
${error && html`<div class="errors" role="alert"><p>${error}</p></div>`}
${
  channels.length === 0
    ? html`<p>Your Buffer account has no channels yet. Connect one at <a href="https://publish.buffer.com">publish.buffer.com</a>, then come back.</p>`
    : html`<form method="post" action="/c/${chorus._id}/join" class="channels">
<fieldset>
<legend>Your Buffer channels</legend>
${options}
</fieldset>
<div class="actions">
  <button type="submit" class="button primary"${usable.length === 0 && " disabled"}>Join with this channel</button>
</div>
</form>`
}`;
}
