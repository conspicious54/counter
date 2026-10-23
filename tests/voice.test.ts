import { test } from "node:test";
import assert from "node:assert/strict";
import { voiceActivity } from "../lib/voice-activity";
test("silence and a short click do not finish recording", () => {
  const update = voiceActivity();
  assert.equal(update(0, 10000), false);
  update(0.1, 10100);
  assert.equal(update(0, 15000), false);
});
test("speech finishes after a pause and continued speech resets the pause", () => {
  const update = voiceActivity();
  for (let i = 0; i < 5; i++) update(0.04, i * 20);
  assert.equal(update(0, 1500), false);
  assert.equal(update(0.04, 1600), false);
  assert.equal(update(0, 3200), false);
  assert.equal(update(0, 3400), true);
});
