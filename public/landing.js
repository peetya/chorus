// The landing map's loop. CSS moves the morning light (56 s per loop); this lights each city when the light
// reaches it. Under reduced motion CSS runs no animation, so this does nothing and the still frame stays.
const [loop] = document.querySelector(".hero-band")?.getAnimations() ?? [];
const dots = document.querySelectorAll(".hero-dot");
if (loop) {
  setInterval(() => {
    const at = loop.effect.getComputedTiming().progress ?? 0;
    for (const dot of dots) {
      dot.classList.toggle("lit", at >= Number(dot.dataset.at) && at < 0.86);
    }
  }, 200);
}
