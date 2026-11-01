import { type Html, html } from "../html.ts";
import {
  type ChorusImage,
  type Crop,
  cropFor,
  imageFor,
  MAX_ALT,
  MAX_IMAGES,
  needsImage,
} from "../images.ts";
import type { Post } from "../posts.ts";
import { serviceName, shortName } from "./labels.ts";

const CROP_LABELS: [Crop, string][] = [
  ["linkedin", "LinkedIn · 1.91:1"],
  ["wide", "X · 16:9"],
  ["wide", "Bluesky · 16:9"],
  ["portrait", "Instagram · 4:5"],
];

const RATIOS: Partial<Record<Crop, string>> = {
  linkedin: "1.91:1",
  wide: "16:9",
  portrait: "4:5",
};

const percent = (n: number) => `${Math.round(n * 1000) / 10}%`;

// focus.js moves the crosshair and saves the new focus point.
function focusPick(image: ChorusImage): Html {
  return html`<div class="focus-pick" data-focus="/images/${image.id}">
    <img src="${image.urls.original}" alt="" draggable="false">
    <span class="focus-mark" style="left: ${percent(image.focus.x)}; top: ${percent(image.focus.y)}"></span>
  </div>`;
}

function crops(image: ChorusImage): Html {
  return html`<div class="crops">
    <span class="small-label">Cropped for each network</span>
    <div>
    ${CROP_LABELS.map(
      ([crop, label]) =>
        html`<figure><img src="${image.urls[crop]}" alt="" data-crop="${crop}"><figcaption>${label}</figcaption></figure>`,
    )}
    </div>
  </div>`;
}

// On "Start a Chorus", where the Chorus doesn't exist yet. new-images.js uploads each image when it's
// picked and swaps in the card the server sends back, so a form error doesn't lose any of them.
export function formImageCard(image: ChorusImage, i: number): Html {
  return html`<div class="image-card" data-image="${image.id}">
  ${focusPick(image)}
  <div class="image-meta">
    <span><strong>Image <span data-n>${i + 1}</span></strong> <span class="muted small">${image.width} × ${image.height}</span></span>
    <button type="button" class="button small-button" data-remove-image>Remove</button>
  </div>
  ${crops(image)}
  <div class="field">
    <label for="alt-${image.id}">Describe image <span data-n>${i + 1}</span></label>
    <input id="alt-${image.id}" type="text" name="alt-${image.id}" value="${image.alt}" maxlength="${MAX_ALT}" required>
  </div>
</div>`;
}

export function formImages(images: ChorusImage[]): Html {
  return html`<fieldset class="form-images" data-images>
<legend>Images <span class="optional">(optional, up to ${MAX_IMAGES})</span></legend>
<p class="hint">Different images help the posts not look the same. Chorus gives each person one of them, and they can pick another one or post without an image. Drag the crosshair to move an image's focus point: Chorus crops it for each network and keeps that spot in view.</p>
<div class="image-grid" data-image-list>
${images.map(formImageCard)}
</div>
<div class="field" data-image-add${images.length >= MAX_IMAGES && " hidden"}>
  <label for="image-file">Add an image <span class="optional">· JPEG, PNG or WebP, up to 4 MB</span></label>
  <input id="image-file" type="file" accept="image/jpeg,image/png,image/webp">
</div>
<div class="errors" role="alert" data-image-error hidden></div>
</fieldset>`;
}

function previewHint(service: string, organizer: string): string {
  const ratio = RATIOS[cropFor(service)];
  if (!ratio) return `${serviceName(service)} gets the whole image.`;
  return `Cropped to ${ratio} for ${serviceName(service)}. Chorus keeps the spot ${shortName(organizer)} marked in view.`;
}

// In the editor: one image is picked for the person, and they can take another or none.
// write.js swaps the preview when the choice changes.
export function imagePicker(
  images: ChorusImage[],
  post: Post,
  organizer: string,
): Html | false {
  if (images.length === 0) return false;
  const current = imageFor(images, post);
  const crop = cropFor(post.channelService);
  const network = serviceName(post.channelService);
  const required = needsImage(post.channelService);
  const choice =
    images.length > 1
      ? "We picked one for you, so the posts don't all look the same. Pick another one if you like."
      : required
        ? `Your post goes out with it: ${network} needs an image.`
        : "Your post goes out with it, or without an image if you like.";
  return html`<fieldset class="image-pick">
  <legend>Image</legend>
  <p class="muted">${shortName(organizer)} added ${images.length === 1 ? "an image" : `${images.length} images`}. ${choice}</p>
  <div class="image-pick-row">
    <div class="image-options">
    ${images.map(
      (image, i) => html`<label class="image-option">
      <img src="${image.urls.original}" alt="${image.alt}">
      <span><input type="radio" name="image" value="${i}"${image === current && " checked"}> Image ${i + 1}</span>
    </label>`,
    )}
      ${
        !required &&
        html`<label class="image-option">
        <span class="no-image">Post without an image</span>
        <span><input type="radio" name="image" value="none"${!current && " checked"}> No image</span>
      </label>`
      }
    </div>
    <div class="image-preview">
      <span class="small-label">How it looks on ${network}</span>
      ${images.map(
        (image, i) =>
          html`<img src="${image.urls[crop]}" alt="" data-preview="${i}"${image !== current && " hidden"}>`,
      )}
      <p class="no-image-note" data-preview="none"${current !== null && " hidden"}>No image. The post goes out with your text only.</p>
      <span class="hint">${previewHint(post.channelService, organizer)}</span>
    </div>
  </div>
</fieldset>`;
}

// On the review page: the image exactly as Buffer gets it.
export function reviewImage(images: ChorusImage[], post: Post): Html | null {
  const image = imageFor(images, post);
  return (
    image &&
    html`<figure class="review-image">
  <img src="${image.urls[cropFor(post.channelService)]}" alt="${image.alt}">
  <figcaption class="hint">With the image you picked. Its description: ${image.alt}</figcaption>
</figure>`
  );
}
