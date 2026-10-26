import { test } from "node:test";
import assert from "node:assert/strict";
import { compatible, rankFoods } from "../lib/matching";
import { simpleParse } from "../lib/simple-parse";
import { demoFoods } from "../lib/demo";
import type { Food, Parsed, Entry } from "../lib/types";
const parsed = (name: string, extra: Partial<Parsed> = {}): Parsed => ({
  name,
  brand: null,
  preparation: null,
  quantity: 100,
  unit: "g",
  action: "add",
  ...extra,
});
test("frequently logged unrelated food can never match blueberries", () => {
  const entries = Array.from(
    { length: 10 },
    (_, i) =>
      ({
        id: String(i),
        food: demoFoods[0],
        quantity: 100,
        unit: "g",
        day: "2026-10-22",
        timestamp: "2026-10-22T12:00:00Z",
        groupId: "a",
      }) as Entry,
  );
  const found = rankFoods(demoFoods, parsed("blueberries"), entries);
  assert.equal(found.length, 1);
  assert.equal(found[0].id, "demo-blueberry");
});
test("raw and cooked foods do not substitute for each other", () => {
  assert.equal(compatible(demoFoods[0], parsed("chicken breast", { preparation: "raw" })), false);
  assert.equal(compatible(demoFoods[0], parsed("chicken breast", { preparation: "cooked" })), true);
});
test("generic raw berries rank above processed and branded products", () => {
  const plain: Food = { ...demoFoods[6], id: "raw", name: "Blueberries, raw", source: "USDA" };
  const dried: Food = { ...plain, id: "dried", name: "Blueberries, dried, sweetened" };
  const branded: Food = { ...plain, id: "branded", name: "Blueberries", brand: "Brand" };
  assert.equal(rankFoods([dried, branded, plain], parsed("blueberries"))[0].id, "raw");
});
test("brand is required when supplied; words must actually match", () => {
  const f = { ...demoFoods[6], brand: "Chosen Brand" };
  assert.equal(compatible(f, parsed("blueberries", { brand: "Other Brand" })), false);
  assert.equal(compatible(f, parsed("blueberry")), true);
  assert.equal(compatible(f, parsed("blueberry muffin")), false);
});
test("simple measured entries need no model call and preserve quantities/state", () => {
  const result = simpleParse("150 g blueberries and 200 grams of cooked chicken breast");
  assert.equal(result?.length, 2);
  assert.equal(result?.[0].name, "blueberries");
  assert.equal(result?.[1].preparation, "cooked");
  assert.equal(result?.[1].quantity, 200);
});
test("simple parser declines missing weights, recipe modifications, and ambiguous prose", () => {
  for (const text of [
    "some chicken",
    "my sandwich but add another egg",
    "0 g blueberries",
    "150 g oats instead of rice",
  ])
    assert.equal(simpleParse(text), null);
});

test("black cherries match the whole fruit, never cherry-flavored products", () => {
  const base = { ...demoFoods[6], source: "USDA" as const };
  const fruit = { ...base, id: "cherry", name: "Cherries, sweet, raw" };
  const yogurt = { ...base, id: "silk", name: "Silk Black Cherry Soy Yogurt", brand: "Silk" };
  const juice = { ...base, id: "juice", name: "Black cherry juice" };
  assert.deepEqual(
    rankFoods([yogurt, juice, fruit], parsed("black cherries")).map((f) => f.id),
    ["cherry"],
  );
  assert.deepEqual(rankFoods([yogurt], parsed("black cherries")), []);
  assert.equal(compatible(yogurt, parsed("black cherry soy yogurt", { brand: "Silk" })), true);
});
test("name-only foods skip AI while saved-meal references remain distinct", () => {
  assert.equal(simpleParse("black cherries")?.[0].name, "black cherries");
  assert.equal(simpleParse("blueberries")?.[0].unit, "g");
  assert.equal(simpleParse("black cherry soy yogurt")?.[0].name, "black cherry soy yogurt");
  assert.equal(simpleParse("Papa John's pizza")?.[0].name, "Papa John's pizza");
  assert.equal(simpleParse("my breakfast sandwich"), null);
});

test("simple food names and explicit preparation skip model parsing beyond the fruit list", () => {
  for (const name of [
    "spaghetti squash",
    "broccoli",
    "chicken breast",
    "Greek yogurt",
    "cottage cheese",
    "butternut squash",
  ]) {
    const foods = simpleParse(name);
    assert.equal(foods?.length, 1);
    assert.equal(foods?.[0].name, name);
    assert.equal(foods?.[0].unit, "g");
  }
  assert.equal(simpleParse("cooked spaghetti squash")?.[0].preparation, "cooked");
  assert.equal(simpleParse("raw spaghetti squash.")?.[0].preparation, "raw");
  for (const text of [
    "two large eggs",
    "a chicken sandwich",
    "I just went to the restaurant",
    "my usual breakfast",
    "chicken and rice",
  ])
    assert.equal(simpleParse(text), null);
});
