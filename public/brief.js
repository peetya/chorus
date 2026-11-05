// The "Start a Chorus" form: add and remove list rows, and keep the fact card next to it up to date.
const form = document.querySelector("[data-brief]");

function renumber(list) {
  const rows = list.querySelectorAll(".row");
  rows.forEach((row, i) => {
    const n = i + 1;
    const mark = row.querySelector(".mark");
    if (mark.textContent !== "–") mark.textContent = n;
    const input = row.querySelector("input");
    const label = input.getAttribute("aria-label").replace(/ \d+$/, "");
    input.setAttribute("aria-label", `${label} ${n}`);
    row
      .querySelector("[data-remove]")
      .setAttribute("aria-label", `Remove ${label.toLowerCase()} ${n}`);
  });
  list.querySelector("[data-add]").disabled =
    rows.length >= Number(list.dataset.max);
}

form.addEventListener("click", (event) => {
  const add = event.target.closest("[data-add]");
  const remove = event.target.closest("[data-remove]");
  const list = event.target.closest("[data-list]");
  if (add) {
    const row = list.querySelector("template").content.firstElementChild;
    const copy = row.cloneNode(true);
    add.before(copy);
    renumber(list);
    copy.querySelector("input").focus();
  } else if (remove) {
    // Keep one row, so there is always somewhere to type.
    if (list.querySelectorAll(".row").length > 1)
      remove.closest(".row").remove();
    else remove.closest(".row").querySelector("input").value = "";
    renumber(list);
    updateCard();
  }
});

function values(name) {
  return [...form.querySelectorAll(`[name="${name}"]`)]
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function item(text, mark) {
  const li = document.createElement("li");
  const markSpan = document.createElement("span");
  markSpan.className = "mark";
  markSpan.textContent = mark;
  const textSpan = document.createElement("span");
  textSpan.textContent = text;
  li.append(markSpan, textSpan);
  return li;
}

function updateCard() {
  const facts = values("facts").map((fact, i) => item(fact, i + 1));
  const link = form.elements.link.value.trim();
  if (link) facts.push(item(link.replace(/^https?:\/\//, ""), "↗"));
  document.querySelector("[data-card-facts]").replaceChildren(...facts);

  const tags = form.elements.hashtags.value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((tag) => `#${tag.replace(/^#+/, "")}`);
  const max = form.elements.maxHashtags.value;
  const tagBox = document.querySelector("[data-card-tags]");
  tagBox.hidden = !tags.length;
  tagBox.querySelector(".small-label").textContent = max
    ? `Hashtags · at most ${max}`
    : "Hashtags";
  tagBox.querySelector(".tags").replaceChildren(
    ...tags.map((tag) => {
      const span = document.createElement("span");
      span.textContent = tag;
      return span;
    }),
  );

  const avoid = values("avoid");
  const avoidBox = document.querySelector("[data-card-avoid]");
  avoidBox.hidden = !avoid.length;
  avoidBox.querySelector("ul").replaceChildren(
    ...avoid.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );
}

// The hint under the time says when the posts go out, so it follows the time picked.
function updateTimeHint() {
  const time = form.elements.localTime.value;
  if (time) document.querySelector("[data-time-hint]").textContent = time;
}

form.addEventListener("input", updateCard);
form.addEventListener("input", updateTimeHint);
form.querySelectorAll("[data-list]").forEach(renumber);
updateCard();

// A relay's slots: the first post, then one every gap, the last one before 18:00. Same sums as relayTimes
// in src/time.ts.
function updateSlotHint() {
  const [hour, minute] = form.elements.localTime.value.split(":").map(Number);
  const gap = Number(form.elements.relayGapMin.value);
  const times = [];
  for (let at = hour * 60 + minute; at < 18 * 60; at += gap) {
    times.push(
      `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`,
    );
  }
  const hint = document.querySelector("[data-slot-hint]");
  if (Number.isNaN(hour) || times.length === 0) {
    hint.textContent = "no one yet: pick an earlier first post";
  } else if (times.length === 1) {
    hint.textContent = `1 person, at ${times[0]}`;
  } else {
    hint.textContent = `${times.length} people: ${times[0]} to ${times.at(-1)}`;
  }
}

// A new relay starts in the organizer's own time zone, when the list has it.
const zone = document.querySelector("[data-tz-guess]");
const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (zone && [...zone.options].some((option) => option.value === guess)) {
  zone.value = guess;
}

form.addEventListener("input", updateSlotHint);
