import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateKey, estimatedFood, estimateInputSchema } from "../lib/estimation";
import { lookupFood } from "../lib/food-lookup";
import { rankFoods } from "../lib/matching";
import { scale } from "../lib/nutrition";
import type { Food, Parsed } from "../lib/types";
const description: Parsed = {
  name: "Spicy chicken sandwich",
  brand: "Local Kitchen",
  preparation: null,
  quantity: 1,
  unit: "serving",
  action: "add",
};
const prediction = {
  calories: 600,
  protein: 30,
  carbs: 50,
  fat: 30,
  assumptions: "One standard sandwich with sauce; no sides.",
  clarification: null,
};
const estimate = (p = description) => estimatedFood(p, prediction, "test-model", "estimate-1");
const real: Food = {
  id: "usda-1",
  name: description.name,
  brand: description.brand!,
  source: "USDA",
  basis: { quantity: 1, unit: "serving" },
  nutrients: { calories: 570, protein: 32, carbs: 48, fat: 25 },
};
test("estimated servings scale with consumed quantity; never invent gram conversions", () => {
  const food = estimate();
  assert.equal(food.source, "AI estimate");
  assert.equal(scale({ food, quantity: 2, unit: "serving" }).calories, 1200);
  assert.throws(() => scale({ food, quantity: 200, unit: "g" }), /No verified/);
  const piece = estimate({ ...description, unit: "piece" });
  assert.equal(scale({ food: piece, quantity: 2, unit: "piece" }).calories, 1200);
  assert.throws(() => scale({ food: piece, quantity: 100, unit: "g" }));
});
test("weighed estimate uses a 100 g basis; ml does not become grams; missing nutrient remains unknown", () => {
  const p = { ...description, quantity: 200, unit: "g" as const };
  const food = estimatedFood(
    p,
    { ...prediction, calories: 200, protein: null, carbs: 20, fat: 10 },
    "test",
    "mass",
  );
  assert.deepEqual(scale({ food, quantity: 200, unit: "g" }), {
    calories: 400,
    protein: null,
    carbs: 40,
    fat: 20,
  });
  assert.equal(scale({ food, quantity: 1, unit: "oz" }).calories, 56.69904625);
  const volume = estimate({ ...description, unit: "ml" });
  assert.throws(() => scale({ food: volume, quantity: 100, unit: "g" }));
});
test("estimate reuse key ignores amount but preserves restaurant, portion size, preparation and unit basis", () => {
  assert.equal(estimateKey(description), estimateKey({ ...description, quantity: 2 }));
  assert.notEqual(
    estimateKey(description),
    estimateKey({ ...description, brand: "Different Kitchen" }),
  );
  assert.notEqual(
    estimateKey(description),
    estimateKey({ ...description, name: "Small spicy chicken sandwich" }),
  );
  assert.notEqual(estimateKey(description), estimateKey({ ...description, preparation: "fried" }));
  assert.notEqual(estimateKey(description), estimateKey({ ...description, unit: "g" }));
  assert.equal(
    estimateKey({ ...description, unit: "oz" }),
    estimateKey({ ...description, unit: "g" }),
  );
});
test("rejects invalid, unknown and inconsistent estimates instead of silently filling zero", () => {
  assert.throws(() => estimateInputSchema.parse({ ...description, quantity: 0 }));
  assert.throws(() => estimatedFood(description, { ...prediction, fat: -1 }, "test", "bad"));
  assert.throws(() => estimatedFood(description, { ...prediction, calories: null }, "test", "bad"));
  assert.throws(
    () =>
      estimatedFood(description, { ...prediction, clarification: "Which dish?" }, "test", "bad"),
    /Which dish/,
  );
  assert.throws(() =>
    estimatedFood({ ...description, unit: "g" }, { ...prediction, carbs: 90 }, "test", "bad"),
  );
});
test("database miss automatically invokes estimate once and produces a normal confirmable candidate", async () => {
  let searches = 0,
    calls = 0;
  const result = await lookupFood(description, {
    foods: [],
    entries: [],
    online: true,
    database: true,
    search: async () => {
      searches++;
      return [];
    },
    estimate: async (p) => {
      calls++;
      return estimate(p);
    },
  });
  assert.equal(searches, 1);
  assert.equal(calls, 1);
  assert.equal(result.food.source, "AI estimate");
  assert.equal(result.warning, undefined);
});
test("database wins over saved AI estimate; remembered verified food never spends an AI call", async () => {
  let calls = 0,
    searches = 0;
  const options = {
    foods: [estimate()],
    entries: [],
    online: true,
    database: true,
    search: async () => {
      searches++;
      return [real];
    },
    estimate: async () => {
      calls++;
      return estimate();
    },
  };
  const result = await lookupFood(description, options);
  assert.equal(result.food.id, real.id);
  assert.equal(calls, 0);
  const cached = await lookupFood(description, { ...options, foods: [estimate(), real] });
  assert.equal(cached.food.id, real.id);
  assert.equal(searches, 1);
  assert.equal(rankFoods([estimate(), real], description)[0].source, "USDA");
});
test("reuses exact cached estimate offline, but never silently mixes restaurants or weight bases", async () => {
  let calls = 0;
  const options = {
    foods: [estimate()],
    entries: [],
    online: false,
    database: true,
    search: async () => [],
    estimate: async () => {
      calls++;
      return estimate();
    },
  };
  const cached = await lookupFood({ ...description, quantity: 2 }, options);
  assert.equal(scale(cached).calories, 1200);
  assert.equal(calls, 0);
  await assert.rejects(
    () => lookupFood({ ...description, brand: "Different Kitchen" }, options),
    /Connect/,
  );
  await assert.rejects(() => lookupFood({ ...description, unit: "g" }, options), /Connect/);
});
test("database outage does not masquerade as a miss or spend on an estimate", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      lookupFood(description, {
        foods: [],
        entries: [],
        online: true,
        database: true,
        search: async () => {
          throw new Error("Database down");
        },
        estimate: async () => {
          calls++;
          return estimate();
        },
      }),
    /Database down/,
  );
  assert.equal(calls, 0);
});

test("restaurant brand punctuation does not hide a real match and serving sizes cannot swap", () => {
  const fries: Food = { ...real, name: "Large fries", brand: "Chick-fil-A" };
  const p: Parsed = { ...description, name: "large fries", brand: "Chickfila" };
  assert.equal(rankFoods([fries], p).length, 1);
  assert.equal(rankFoods([{ ...fries, name: "Small fries" }], p).length, 0);
});
