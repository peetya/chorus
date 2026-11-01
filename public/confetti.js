// A short burst of confetti on the finished page, once per browser for each Chorus. Never under reduced
// motion. The canvas lets every click through and goes away when the burst ends.
const SEEN = `confetti:${location.pathname}`;
const COLORS = ["#FCD34D", "#FDBA74", "#FB923C", "#F97316", "#C2410C"];
const SIZES = [
  [8, 12],
  [10, 5],
  [7, 7],
];
const SECONDS = 2.8;

function firstVisit() {
  try {
    if (localStorage.getItem(SEEN)) return false;
    localStorage.setItem(SEEN, "1");
    return true;
  } catch {
    // Storage is blocked: skip the confetti rather than show it on every visit.
    return false;
  }
}

function burst() {
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  const ratio = devicePixelRatio || 1;
  canvas.width = innerWidth * ratio;
  canvas.height = innerHeight * ratio;
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);

  // Two bursts near the top, each bit shot upwards at up to 80 degrees off straight up.
  const bits = [];
  for (const x of [0.26, 0.74]) {
    for (let i = 0; i < 40; i++) {
      const angle = (Math.random() - 0.5) * 2.8;
      const speed = 900 + Math.random() * 400;
      const [w, h] = SIZES[i % SIZES.length];
      bits.push({
        x: innerWidth * x,
        y: Math.min(250, innerHeight * 0.4),
        vx: Math.sin(angle) * speed,
        vy: -Math.cos(angle) * speed,
        turn: Math.random() * 6,
        spin: (Math.random() - 0.5) * 16,
        w,
        h,
        color: COLORS[i % COLORS.length],
      });
    }
  }

  const start = performance.now();
  let last = start;
  function frame(now) {
    const age = (now - start) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    // Fades out over the last half second.
    ctx.globalAlpha = Math.max(0, Math.min(1, (SECONDS - age) / 0.5));
    for (const bit of bits) {
      // Air slows the bits down, gravity pulls them back.
      bit.vx -= bit.vx * 2.5 * dt;
      bit.vy += (900 - bit.vy * 2.5) * dt;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.turn += bit.spin * dt;
      ctx.save();
      ctx.translate(bit.x, bit.y);
      ctx.rotate(bit.turn);
      ctx.fillStyle = bit.color;
      ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);
      ctx.restore();
    }
    if (age < SECONDS) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

if (!matchMedia("(prefers-reduced-motion: reduce)").matches && firstVisit()) {
  burst();
}
