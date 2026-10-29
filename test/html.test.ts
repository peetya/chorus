import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, html, raw } from "../src/html.ts";

test("escapeHtml makes names safe to show", () => {
  assert.equal(
    escapeHtml(`<script>"x" & 'y'</script>`),
    "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;",
  );
});

test("html escapes every value", () => {
  const name = `<img src=x onerror="alert(1)">`;
  assert.equal(
    html`<p title="${name}">${name}</p>`.value,
    `<p title="&lt;img src=x onerror=&quot;alert(1)&quot;&gt;">&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>`,
  );
});

test("nested html and lists pass through, empty values render as nothing", () => {
  const items = ["a", "<b>"].map((item) => html`<li>${item}</li>`);
  assert.equal(
    html`<ul>${items}</ul>${false}${null}${undefined}${0}`.value,
    "<ul><li>a</li><li>&lt;b&gt;</li></ul>0",
  );
});

test("raw markup is kept as it is", () => {
  assert.equal(html`${raw("<svg></svg>")}`.value, "<svg></svg>");
});
