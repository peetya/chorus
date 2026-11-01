// Refreshes the wall and its map every minute. Asking for them also lets the server check due posts with
// Buffer.
const parts = document.querySelectorAll("[data-wall]");
setInterval(async () => {
  for (const part of parts) {
    const res = await fetch(part.dataset.wall);
    if (res.ok) part.innerHTML = await res.text();
  }
}, 60_000);
