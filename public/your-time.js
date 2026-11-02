// Times on a page are in a place's own time zone: "13:45" in Los Angeles. When the reader is somewhere else,
// this adds their own time next to each one. wall.js swaps parts of the page every minute, so it watches.
const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
const format = (timeZone, options) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, ...options });
const clock = { hour: "2-digit", minute: "2-digit" };
const day = { weekday: "short" };

function addYourTime() {
  for (const time of document.querySelectorAll("time[data-zone]")) {
    if (time.nextElementSibling?.classList.contains("your-time")) continue;
    const at = new Date(time.dateTime);
    // A time zone can be at most a day ahead or behind, so the weekday says which day it is.
    const theirs = format(time.dataset.zone, { ...day, ...clock }).format(at);
    const yours = format(here, { ...day, ...clock }).format(at);
    if (theirs === yours) continue;
    const sameDay =
      format(time.dataset.zone, day).format(at) ===
      format(here, day).format(at);
    const mine = `${sameDay ? "" : `${format(here, day).format(at)} `}${format(here, clock).format(at)}`;
    const note = document.createElement("span");
    note.className = "your-time";
    // The walls' lists have a narrow time column, so it gets the short form under the time.
    note.textContent = time.closest(".wall-post")
      ? `${mine} for you`
      : ` (${mine} your time)`;
    time.after(note);
  }
}

addYourTime();
new MutationObserver(addYourTime).observe(document.body, {
  childList: true,
  subtree: true,
});
