import test from "node:test";
import assert from "node:assert/strict";
import { dialedDays } from "../lib/dialed-payload";
import type { Entry } from "../lib/types";
const entry: Entry = {
  id: "e",
  day: "2026-10-25",
  timestamp: "2026-10-25T16:00:00Z",
  groupId: "g",
  quantity: 100,
  unit: "g",
  food: {
    id: "f",
    name: "Food",
    source: "Custom",
    basis: { quantity: 100, unit: "g" },
    nutrients: { calories: 150, protein: 4, carbs: 30, fat: 0 },
  },
};
test("Dialed totals include edits, known zero and explicit last-entry deletion", () => {
  assert.equal(dialedDays([{ ...entry, quantity: 200 }], [])[0].nutrition?.calories, 300);
  assert.equal(dialedDays([{ ...entry, deleted: true }], [])[0].nutrition?.calories, 0);
  assert.equal(dialedDays([entry], [])[0].nutrition?.fat, 0);
  assert.deepEqual(dialedDays([], []), []);
});
test("unknown nutrient stays unknown and sample foods never export", () => {
  assert.equal(
    dialedDays(
      [
        {
          ...entry,
          food: { ...entry.food, nutrients: { ...entry.food.nutrients, protein: null } },
        },
      ],
      [],
    )[0].nutrition?.protein,
    null,
  );
  assert.deepEqual(dialedDays([{ ...entry, food: { ...entry.food, source: "Demo" } }], []), []);
});
test("latest stable body weight wins per local calendar day, without inventing food totals", () => {
  const time = new Date(2026, 9, 25, 8).toISOString(),
    later = new Date(2026, 9, 25, 10).toISOString();
  const days = dialedDays(
    [],
    [
      { id: "new", kilograms: 82, recordedAt: later },
      { id: "old", kilograms: 80, recordedAt: time },
    ],
  );
  assert.equal(days.length, 1);
  assert.equal(days[0].date, "2026-10-25");
  assert.equal(days[0].weight?.id, "new");
  assert.equal(days[0].nutrition, undefined);
});

test("weigh-ins near UTC midnight retain the user’s Denver calendar date", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Denver";
  try {
    assert.equal(
      dialedDays([], [{ id: "boundary", kilograms: 82, recordedAt: "2026-10-26T00:30:00.000Z" }])[0]
        .date,
      "2026-10-25",
    );
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
