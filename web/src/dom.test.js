import assert from "node:assert/strict";
import { test } from "node:test";
import { el } from "./dom.js";

test("el recusa HTML em texto", () => {
  assert.throws(() => el("p", { innerHTML: "x" }), TypeError);
  assert.throws(() => el("p", { outerHTML: "x" }), TypeError);
});
