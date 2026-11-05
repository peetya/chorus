// Buffer's London can mean "no time zone set", so offer the browser's own zone instead.
const select = document.querySelector("[data-tz-guess]");
const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (
  select &&
  guess !== select.value &&
  [...select.options].some((option) => option.value === guess)
) {
  select.value = guess;
  select.nextElementSibling.textContent =
    "Buffer says London, which is also what it says when a channel has no time zone set. This is your computer's time zone instead. Check it.";
}
