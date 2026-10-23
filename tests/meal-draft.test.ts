import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendIngredients,
  clearMealDraft,
  loadMealDraft,
  recipeItems,
  saveMealDraft,
} from "../lib/meal-draft";
import { totals } from "../lib/nutrition";
import { demoFoods } from "../lib/demo";
import type { Candidate } from "../lib/types";
const disk = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => disk.get(key) || null,
    setItem: (key: string, value: string) => disk.set(key, value),
    removeItem: (key: string) => disk.delete(key),
  },
  configurable: true,
});
const item = (index: number, quantity: number): Candidate => ({
  food: { ...demoFoods[index], source: "Custom" },
  quantity,
  unit: "g",
  alternatives: [],
});
test("ingredient-by-ingredient meal preserves earlier foods and calculates total", () => {
  const initial = [item(6, 80)];
  const meal = appendIngredients(initial, [item(5, 200)]);
  assert.equal(initial.length, 1);
  assert.equal(meal.length, 2);
  assert.equal(totals(meal).calories, 163.6);
  assert.equal(recipeItems(meal).length, 2);
  assert.equal("alternatives" in recipeItems(meal)[0], false);
});
test("meal draft with name survives closing/reloading and can be cleared", () => {
  saveMealDraft({
    items: [item(6, 150), item(5, 200)],
    name: "Berry bowl",
    saveAsMeal: true,
    recipeOnly: true,
  });
  const draft = loadMealDraft();
  assert.equal(draft?.name, "Berry bowl");
  assert.equal(draft?.recipeOnly, true);
  assert.equal(draft?.items[0].quantity, 150);
  assert.equal(draft?.items.length, 2);
  clearMealDraft();
  assert.equal(loadMealDraft(), null);
});
test("cannot save a meal with invalid quantities or unresolved matches", () => {
  assert.throws(() => recipeItems([]));
  assert.throws(() => recipeItems([item(6, 0)]));
  assert.throws(() =>
    recipeItems([{ ...item(6, 100), warning: "No verified serving conversion" }]),
  );
});

test("retires sample ingredients from old drafts while preserving real ingredients and a backup", () => {
  disk.delete("still.sample-draft-backup.v1");
  const sample = { ...item(6, 100), food: demoFoods[6] };
  saveMealDraft({ items: [sample, item(5, 200)], name: "Mixed bowl", saveAsMeal: true });
  const draft = loadMealDraft();
  assert.equal(draft?.items.length, 1);
  assert.equal(draft?.items[0].food.source, "Custom");
  assert.ok(disk.get("still.sample-draft-backup.v1"));
  saveMealDraft({ items: [sample], name: "Sample only", saveAsMeal: false });
  assert.equal(loadMealDraft(), null);
});
