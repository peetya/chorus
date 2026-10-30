// Refreshes the wall every minute. Asking for it also lets the server check due posts with Buffer.
const wall = document.querySelector("[data-wall]");
setInterval(async () => {
  const res = await fetch(wall.dataset.wall);
  if (res.ok) wall.innerHTML = await res.text();
}, 60_000);
