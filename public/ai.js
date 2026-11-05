// The AI takes a few seconds: the button shows it's working and can't send the answers twice.
const form = document.querySelector("[data-ai]");
const button = form.querySelector("button[type=submit]");
const label = button.textContent;

form.addEventListener("submit", () => {
  button.disabled = true;
  button.classList.add("busy");
  button.textContent = "Writing your draft";
});

// Coming back with the browser's back button can show the page as it was left: busy.
addEventListener("pageshow", () => {
  button.disabled = false;
  button.classList.remove("busy");
  button.textContent = label;
});
