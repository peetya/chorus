// "Start a Chorus": drag the crosshair, or click, to move an image's focus point. It saves in the
// background, and each crop changes once the new one has loaded, so the page doesn't reload or flash.
// Cards come and go, so the events are taken on the document.
function place(pick, event) {
  const box = pick.querySelector("img").getBoundingClientRect();
  const x = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
  const y = Math.min(Math.max((event.clientY - box.top) / box.height, 0), 1);
  const mark = pick.querySelector(".focus-mark");
  mark.style.left = `${x * 100}%`;
  mark.style.top = `${y * 100}%`;
  return { x: x.toFixed(3), y: y.toFixed(3) };
}

async function save(pick, focus) {
  const card = pick.closest(".image-card");
  // Only the last of several quick moves gets to change the crops.
  const turn = String(Number(pick.dataset.turn ?? 0) + 1);
  pick.dataset.turn = turn;
  const res = await fetch(pick.dataset.focus, {
    method: "POST",
    body: new URLSearchParams({
      alt: card.querySelector("[name^=alt]").value,
      focusX: focus.x,
      focusY: focus.y,
    }),
  });
  if (!res.ok || pick.dataset.turn !== turn) return;
  const urls = await res.json();
  const crops = [...card.querySelectorAll("[data-crop]")];
  await Promise.all(
    crops.map(({ dataset }) => {
      const image = new Image();
      image.src = urls[dataset.crop];
      return image.decode().catch(() => {});
    }),
  );
  if (pick.dataset.turn !== turn) return;
  for (const image of crops) image.src = urls[image.dataset.crop];
}

document.addEventListener("pointerdown", (event) => {
  const pick = event.target.closest("[data-focus]");
  if (!pick || event.button !== 0) return;
  event.preventDefault();
  pick.setPointerCapture(event.pointerId);
  let focus = place(pick, event);
  const move = (moved) => {
    focus = place(pick, moved);
  };
  const end = () => {
    pick.removeEventListener("pointermove", move);
    pick.removeEventListener("pointerup", end);
    pick.removeEventListener("pointercancel", end);
    save(pick, focus);
  };
  pick.addEventListener("pointermove", move);
  pick.addEventListener("pointerup", end);
  pick.addEventListener("pointercancel", end);
});
