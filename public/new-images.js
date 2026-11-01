// "Start a Chorus": each image uploads as soon as it's picked, so a form error doesn't lose it. focus.js
// moves the focus points.
const box = document.querySelector("[data-images]");

if (box) {
  const list = box.querySelector("[data-image-list]");
  const add = box.querySelector("[data-image-add]");
  const input = add.querySelector("input");
  const error = box.querySelector("[data-image-error]");

  const renumber = () => {
    const cards = list.querySelectorAll("[data-image]");
    cards.forEach((card, i) => {
      for (const n of card.querySelectorAll("[data-n]")) n.textContent = i + 1;
    });
    add.hidden = cards.length >= 4;
  };

  // The card's HTML, or null after showing why not.
  const send = async (url, body) => {
    error.hidden = true;
    const res = await fetch(url, { method: "POST", body });
    if (res.ok) return res.text();
    error.textContent = await res.text();
    error.hidden = false;
    return null;
  };

  input.addEventListener("change", async () => {
    const [file] = input.files;
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    input.disabled = true;
    const card = await send("/images", body);
    input.disabled = false;
    input.value = "";
    if (card) {
      list.insertAdjacentHTML("beforeend", card);
      renumber();
    }
  });

  list.addEventListener("click", async (event) => {
    const card = event.target.closest("[data-image]");
    if (!card || !event.target.closest("[data-remove-image]")) return;
    card.remove();
    renumber();
    await fetch(`/images/${card.dataset.image}/remove`, { method: "POST" });
  });
}
