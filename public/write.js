// The editor: runs the checks on the server while the person types, at most a few times a second.
const form = document.querySelector("[data-write]");
const results = form.querySelector("[data-results]");
let timer;
let latest = 0;

async function check() {
  const asked = ++latest;
  const res = await fetch(form.dataset.check, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: form.elements.text.value }),
  });
  // An older answer that arrives late must not replace a newer one.
  if (res.ok && asked === latest) results.innerHTML = await res.text();
}

// On a phone the brief sits above the editor. Folded, it leaves the editor in sight; one tap opens it.
if (matchMedia("(max-width: 979px)").matches) {
  document.querySelector("[data-brief-panel]").open = false;
}

form.elements.text.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(check, 300);
});
