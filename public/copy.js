// The copy buttons on the dashboard: the invite link and the reminder.
for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const input = document.getElementById(button.dataset.copy);
    input.select();
    try {
      await navigator.clipboard.writeText(input.value);
      button.textContent = "Copied";
    } catch {
      // The browser blocked the clipboard. The text is selected, so it can be copied by hand.
    }
  });
}
