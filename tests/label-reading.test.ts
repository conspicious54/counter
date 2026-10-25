import test from "node:test";
import assert from "node:assert/strict";
import { foodFromLabel, validateLabelImage } from "../lib/label-reading";
import { scale } from "../lib/nutrition";
const label = {
  name: "Test cereal",
  brand: null,
  basisQuantity: 1,
  basisUnit: "serving",
  servingQuantity: 40,
  servingUnit: "g",
  calories: 150,
  protein: 4,
  carbs: 30,
  fat: 0,
  note: null,
};
test("printed serving weight supports both servings and weighing without mixing units", () => {
  const food = foodFromLabel(label);
  assert.equal(scale({ food, quantity: 2, unit: "serving" }).calories, 300);
  assert.equal(scale({ food, quantity: 60, unit: "g" }).calories, 225);
  assert.equal(scale({ food, quantity: 40, unit: "g" }).fat, 0);
  assert.throws(() => scale({ food, quantity: 40, unit: "ml" }), /No verified/);
});
test("per-100g label uses same-column values and leaves unreadable macros unknown", () => {
  const food = foodFromLabel({ ...label, basisQuantity: 100, basisUnit: "g", protein: null });
  assert.equal(scale({ food, quantity: 100, unit: "g" }).calories, 150);
  assert.equal(scale({ food, quantity: 100, unit: "g" }).protein, null);
  assert.equal(scale({ food, quantity: 1, unit: "serving" }).calories, 60);
});
test("no guessed serving mass or missing basis, invalid values and empty label rejected", () => {
  const food = foodFromLabel({ ...label, servingQuantity: null, servingUnit: null });
  assert.equal(food.basis.unit, "serving");
  assert.throws(() => scale({ food, quantity: 40, unit: "g" }), /No verified/);
  assert.throws(() => foodFromLabel({ ...label, basisUnit: null }), /serving size/);
  assert.throws(
    () => foodFromLabel({ ...label, calories: null, protein: null, carbs: null, fat: null }),
    /Couldn’t read/,
  );
  assert.throws(() => foodFromLabel({ ...label, protein: -1 }));
});
test("image validation rejects unsupported, mislabeled and oversized uploads", () => {
  validateLabelImage(new Uint8Array([255, 216, 255, 0]), "image/jpeg");
  assert.throws(() => validateLabelImage(new Uint8Array([1, 2, 3]), "image/jpeg"));
  assert.throws(() => validateLabelImage(new Uint8Array(3 * 1024 * 1024 + 1), "image/jpeg"));
  assert.throws(() => validateLabelImage(new Uint8Array([1]), "image/svg+xml"));
});
