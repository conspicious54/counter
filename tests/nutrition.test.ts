import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dailyTotals,
  localDay,
  modifyRecipe,
  scale,
  totals,
  supportedUnits,
} from "../lib/nutrition";
import { demoFoods, demoParse } from "../lib/demo";
import type { Entry, Food, Recipe } from "../lib/types";
const chicken = demoFoods[0],
  rice = demoFoods[1],
  egg = demoFoods[2],
  milk = demoFoods[7];
test("scales consumed nutrients from a 100 g basis", () => {
  assert.equal(scale({ food: chicken, quantity: 150, unit: "g" }).calories, 247.5);
  assert.equal(scale({ food: chicken, quantity: 150, unit: "g" }).protein, 46.5);
});
test("uses verified piece and serving weights", () => {
  assert.equal(scale({ food: egg, quantity: 2, unit: "piece" }).calories, 143);
  const f: Food = { ...chicken, portions: { serving: { quantity: 125, unit: "g" } } };
  assert.equal(scale({ food: f, quantity: 2, unit: "serving" }).calories, 412.5);
});
test("does not confuse grams, ml, cups or servings", () => {
  for (const unit of ["ml", "cup", "serving"] as const)
    assert.throws(() => scale({ food: chicken, quantity: 1, unit }));
  assert.throws(() => scale({ food: milk, quantity: 100, unit: "g" }));
  assert.equal(scale({ food: milk, quantity: 200, unit: "ml" }).calories, 100);
});
test("native serving basis is not interpreted as grams", () => {
  const f: Food = { ...chicken, basis: { quantity: 1, unit: "serving" } };
  assert.equal(scale({ food: f, quantity: 2, unit: "serving" }).calories, 330);
  assert.throws(() => scale({ food: f, quantity: 100, unit: "g" }));
});
test("known zero differs from an unknown nutrient", () => {
  const f = { ...chicken, nutrients: { ...chicken.nutrients, protein: null } };
  const n = totals([
    { food: f, quantity: 100, unit: "g" },
    { food: rice, quantity: 100, unit: "g" },
  ]);
  assert.equal(n.protein, null);
  assert.equal(n.calories, 295);
  assert.equal(scale({ food: chicken, quantity: 100, unit: "g" }).carbs, 0);
});
test("rejects invalid quantities", () => {
  for (const quantity of [0, -1, NaN, Infinity])
    assert.throws(() => scale({ food: chicken, quantity, unit: "g" }));
});
test("date boundaries respect local timezone and DST", () => {
  assert.equal(localDay(new Date("2026-10-23T01:30:00Z"), "America/Denver"), "2026-10-22");
  assert.equal(localDay(new Date("2026-10-23T01:30:00Z"), "Asia/Tokyo"), "2026-10-23");
  assert.equal(localDay(new Date("2026-03-08T09:30:00Z"), "America/Denver"), "2026-03-08");
  assert.equal(localDay(new Date("2026-11-01T08:30:00Z"), "America/Denver"), "2026-11-01");
});
test("recipe add/set/remove modifications never mutate original", () => {
  const recipe: Recipe = {
    id: "1",
    name: "Breakfast",
    items: [
      { food: egg, quantity: 1, unit: "piece" },
      { food: rice, quantity: 100, unit: "g" },
    ],
  };
  const modified = modifyRecipe(recipe, [{ food: egg, quantity: 1, unit: "piece", action: "add" }]);
  assert.equal(modified[0].quantity, 2);
  assert.equal(recipe.items[0].quantity, 1);
  const changed = modifyRecipe(recipe, [
    { food: egg, quantity: 3, unit: "piece", action: "set" },
    { food: rice, quantity: 100, unit: "g", action: "remove" },
  ]);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].quantity, 3);
  assert.equal(totals(changed).calories, 214.5);
});
test("daily totals exclude tombstones and other dates, reflect edits", () => {
  const entry: Entry = {
    food: chicken,
    quantity: 100,
    unit: "g",
    id: "1",
    groupId: "m",
    timestamp: "2026-10-23T01:30:00Z",
    day: "2026-10-22",
  };
  const entries = [
    entry,
    { ...entry, id: "2", day: "2026-10-23" },
    { ...entry, id: "3", deleted: true },
  ];
  assert.equal(dailyTotals(entries, "2026-10-22").calories, 165);
  assert.equal(dailyTotals([{ ...entry, quantity: 200 }], "2026-10-22").calories, 330);
  assert.equal(dailyTotals([], "2026-10-22").calories, 0);
});
test("ounces convert only to a compatible mass basis", () => {
  assert.ok(
    Math.abs(scale({ food: chicken, quantity: 1, unit: "oz" }).calories! - 46.7767) < 0.001,
  );
  assert.ok(!supportedUnits(milk).includes("oz"));
});
test("demo parser supports a multi-food example with cooked state", () => {
  const items = demoParse("200 grams of cooked chicken breast and 100 grams of rice");
  assert.equal(items.length, 2);
  assert.equal(items[0].quantity, 200);
  assert.equal(items[0].unit, "g");
  assert.equal(items[0].preparation, "cooked");
  assert.equal(demoParse("Two large eggs")[0].quantity, 2);
});
