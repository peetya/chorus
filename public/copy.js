// The "Copy link" button next to the invite link.
for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const input = document.getElementById(button.dataset.copy);
    input.select();
    await navigator.clipboard.writeText(input.value);
    button.textContent = "Copied";
  });
}
