import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fromOpenFoodFacts,
  combineBarcodeNutrition,
  resolveBarcode,
  completeNutrition,
  barcodeCandidate,
} from "../lib/barcode-nutrition";
import { fromUSDA } from "../lib/providers";
import { scale } from "../lib/nutrition";
import type { Food } from "../lib/types";
const code = "012345678905";
const off = (nutriments: any, extra: any = {}) =>
  fromOpenFoodFacts({ product_name: "Test bar", nutriments, ...extra }, code);
const full = () =>
  off({ "energy-kcal_100g": 200, proteins_100g: 10, carbohydrates_100g: 25, fat_100g: 6 });
test("OFF reads numeric strings, preserves true zero, and converts kJ to kcal", () => {
  const food = off({
    energy_100g: "418.4",
    proteins_100g: "0",
    carbohydrates_100g: "20",
    fat_100g: "",
  });
  assert.ok(Math.abs(food.nutrients.calories! - 100) < 1e-9);
  assert.equal(food.nutrients.protein, 0);
  assert.equal(food.nutrients.fat, null);
});
test("serving-only nutrition is usable without inventing grams or defaulting to 100 servings", () => {
  const food = off(
    { "energy-kcal_serving": 210, proteins_serving: 20, carbohydrates_serving: 20, fat_serving: 6 },
    { serving_size: "1 bar" },
  );
  assert.equal(food.basis.unit, "serving");
  assert.equal(barcodeCandidate(food).quantity, 1);
  assert.equal(scale(barcodeCandidate(food)).calories, 210);
  assert.throws(() => scale({ food, quantity: 100, unit: "g" }));
});
test("explicit serving mass normalizes serving nutrients and fills missing per100 fields", () => {
  const food = off(
    { "energy-kcal_serving": 100, proteins_serving: 5, carbohydrates_serving: 10, fat_serving: 3 },
    { serving_size: "1 bar (50 g)" },
  );
  assert.equal(food.basis.unit, "g");
  assert.equal(food.nutrients.calories, 200);
  assert.equal(scale(barcodeCandidate(food)).calories, 100);
});
test("volume serving normalization never becomes grams", () => {
  const food = off(
    { "energy-kcal_serving": 120, proteins_serving: 8, carbohydrates_serving: 12, fat_serving: 4 },
    { serving_size: "240 ml", product_quantity_unit: "ml" },
  );
  assert.equal(food.basis.unit, "ml");
  assert.equal(scale(barcodeCandidate(food)).calories, 120);
  assert.throws(() => scale({ food, quantity: 240, unit: "g" }));
});
test("USDA supports Atwater energy IDs, numeric values, and explicit label-serving conversion", () => {
  const f = fromUSDA({
    fdcId: 1,
    description: "Raw berries",
    foodNutrients: [
      { nutrient: { id: 2048 }, amount: 57 },
      { nutrientId: 1003, value: "0.7" },
    ],
  });
  assert.equal(f.nutrients.calories, 57);
  assert.equal(f.nutrients.protein, 0.7);
  const label = fromUSDA({
    fdcId: 2,
    description: "Label",
    servingSize: 50,
    servingSizeUnit: "g",
    labelNutrients: { calories: { value: 100 }, protein: { value: 5 } },
  });
  assert.equal(label.nutrients.calories, 200);
  assert.equal(label.nutrients.protein, 10);
  const liquid = fromUSDA({
    fdcId: 3,
    description: "Liquid",
    servingSize: 50,
    servingSizeUnit: "ml",
    labelNutrients: { calories: { value: 100 } },
  });
  assert.equal(liquid.nutrients.calories, null);
});
test("incomplete OFF match continues to exact USDA candidates, including after an unrelated first hit", async () => {
  let calls = 0;
  const missing = off({});
  const exact = { ...full(), id: "usda-1", source: "USDA" as const, barcode: "00012345678905" };
  const found = await resolveBarcode(
    code,
    async () => missing,
    async () => {
      calls++;
      return [{ ...full(), barcode: "999999999999" }, exact];
    },
  );
  assert.equal(calls, 1);
  assert.ok(found && completeNutrition(found));
  assert.equal(found?.nutrients.calories, 200);
});
test("complete OFF match skips USDA; OFF outage still allows exact USDA recovery", async () => {
  let calls = 0;
  await resolveBarcode(
    code,
    async () => full(),
    async () => {
      calls++;
      return [];
    },
  );
  assert.equal(calls, 0);
  const recovered = await resolveBarcode(
    code,
    async () => {
      throw new Error("timeout");
    },
    async () => [full()],
  );
  assert.equal(recovered?.name, "Test bar");
});
test("only same-barcode compatible bases merge; unknowns and known zero remain distinct", () => {
  const partial = off({ "energy-kcal_100g": 100, proteins_100g: 0 });
  const secondary: Food = {
    ...full(),
    source: "USDA",
    basis: { quantity: 50, unit: "g" },
    nutrients: { calories: 90, protein: 9, carbs: 10, fat: 5 },
  };
  const merged = combineBarcodeNutrition(partial, secondary);
  assert.equal(merged.nutrients.calories, 100);
  assert.equal(merged.nutrients.protein, 0);
  assert.equal(merged.nutrients.carbs, 20);
  assert.equal(merged.nutrients.fat, 10);
  assert.deepEqual(merged.nutritionSources, ["Open Food Facts", "USDA"]);
  assert.deepEqual(
    combineBarcodeNutrition(partial, { ...secondary, barcode: "999999999999" }),
    partial,
  );
  const wrongBasis = combineBarcodeNutrition(partial, {
    ...secondary,
    basis: { quantity: 50, unit: "ml" },
  });
  assert.notEqual(wrongBasis.nutrients.carbs, 20);
});
test("partial match remains explicitly unknown; total database outage does not pretend not-found", async () => {
  const partial = off({ "energy-kcal_100g": 100 });
  const found = await resolveBarcode(
    code,
    async () => partial,
    async () => [],
  );
  assert.equal(found?.nutrients.protein, null);
  assert.ok(barcodeCandidate(off({})).warning);
  await assert.rejects(
    () =>
      resolveBarcode(
        code,
        async () => {
          throw new Error("offline");
        },
        async () => [],
      ),
    /unavailable/,
  );
  assert.equal(
    await resolveBarcode(
      code,
      async () => null,
      async () => [],
    ),
    null,
  );
});

test("USDA household serving supplies explicit slice mass, without guessing pizza weights", () => {
  const record = {
    fdcId: 123,
    description: "Hawaiian pizza",
    servingSize: 240,
    servingSizeUnit: "g",
    householdServingFullText: "2 slices (240 g)",
    foodNutrients: [],
  };
  assert.deepEqual(fromUSDA(record).portions?.slice, { quantity: 120, unit: "g" });
  assert.equal(
    fromUSDA({ ...record, householdServingFullText: "1 pizza" }).portions?.slice,
    undefined,
  );
  assert.equal(fromUSDA({ ...record, servingSizeUnit: "ml" }).portions?.slice, undefined);
  assert.deepEqual(fromUSDA({ ...record, householdServingFullText: "1/2 slice" }).portions?.slice, {
    quantity: 480,
    unit: "g",
  });
});
