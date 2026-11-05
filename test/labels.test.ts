import assert from "node:assert/strict";
import { test } from "node:test";
import { initials, shortName } from "../src/views/labels.ts";

test("names show as first name and initial, and as initials", () => {
  assert.equal(shortName("Péter Zsolt Halász"), "Péter H.");
  assert.equal(initials("Péter Zsolt Halász"), "PH");
  assert.equal(initials("Aiko"), "A");
  assert.equal(initials(" "), "?");
});
