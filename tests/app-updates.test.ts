import test from "node:test";
import assert from "node:assert/strict";
import { shouldUpdate } from "../lib/app-updates";
test("updates only when idle and avoids repeated reloads", () => {
  assert.equal(shouldUpdate("a", "b", null, true), true);
  assert.equal(shouldUpdate("a", "b", null, false), false);
  assert.equal(shouldUpdate("a", "a", null, true), false);
  assert.equal(shouldUpdate("a", "b", "b", true), false);
  assert.equal(shouldUpdate("local", "b", null, true), false);
  assert.equal(shouldUpdate("a", "", null, true), false);
});
