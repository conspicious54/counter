import test from "node:test";
import assert from "node:assert/strict";
import { makeWaterEntry, dailyWater, removeWater } from "../lib/water";
test("one tap per container adds the exact ounces and drink count", () => {
  const a = makeWaterEntry("yeti", "2026-10-25", new Date("2026-10-25T16:00:00Z"));
  const b = makeWaterEntry("hydro", "2026-10-25", new Date("2026-10-25T17:00:00Z"));
  const c = makeWaterEntry("yeti", "2026-10-25", new Date("2026-10-25T18:00:00Z"));
  const total = dailyWater([a, b, c], "2026-10-25");
  assert.equal(total.ounces, 100);
  assert.equal(total.count, 3);
  assert.equal(new Set([a.id, b.id, c.id]).size, 3);
});
test("undo persists a tombstone, recalculates totals, and leaves other days alone", () => {
  const a = makeWaterEntry("yeti", "2026-10-25");
  const b = makeWaterEntry("hydro", "2026-10-25");
  const c = makeWaterEntry("hydro", "2026-10-24");
  const updated = removeWater([a, b, c], a.id);
  assert.equal(updated[0].deleted, true);
  assert.equal(dailyWater(updated, "2026-10-25").ounces, 16);
  assert.equal(dailyWater(updated, "2026-10-24").ounces, 16);
  assert.equal(dailyWater(updated, "2026-10-25").count, 1);
  assert.equal(a.deleted, undefined);
});
test("UTC timestamps keep their explicitly selected local calendar day across midnight", () => {
  const entry = makeWaterEntry("hydro", "2026-10-25", new Date("2026-10-26T05:59:00Z"));
  assert.equal(entry.timestamp, "2026-10-26T05:59:00.000Z");
  assert.equal(dailyWater([entry], "2026-10-25").count, 1);
  assert.equal(dailyWater([entry], "2026-10-26").count, 0);
  assert.deepEqual(dailyWater([], "2026-10-26"), { drinks: [], ounces: 0, count: 0 });
});
