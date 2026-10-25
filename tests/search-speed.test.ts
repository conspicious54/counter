import test from "node:test";
import assert from "node:assert/strict";
import { needsSearchDetail } from "../lib/search-plan";
import { resultCache } from "../lib/result-cache";
import type { Food } from "../lib/types";
const food: Food = {
  id: "usda-1",
  name: "Blueberries",
  source: "USDA",
  basis: { quantity: 100, unit: "g" },
  nutrients: { calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3 },
};
test("complete weighed foods skip detail calls; portions and missing values still hydrate", () => {
  assert.equal(needsSearchDetail(food, "g"), false);
  assert.equal(needsSearchDetail(food, "oz"), false);
  assert.equal(needsSearchDetail(food, "slice"), true);
  assert.equal(needsSearchDetail(food, "ml"), true);
  assert.equal(needsSearchDetail(food, null), true);
  assert.equal(
    needsSearchDetail({ ...food, nutrients: { ...food.nutrients, protein: null } }, "g"),
    true,
  );
});
test("search cache coalesces duplicate lookups, separates queries, and retries failures", async () => {
  const cached = resultCache<number>();
  let calls = 0;
  const load = async () => {
    calls++;
    return 7;
  };
  assert.deepEqual(await Promise.all([cached("berries", load), cached("berries", load)]), [7, 7]);
  assert.equal(await cached("berries", load), 7);
  assert.equal(calls, 1);
  await cached("rice", load);
  assert.equal(calls, 2);
  await assert.rejects(
    () =>
      cached("bad", async () => {
        throw new Error("outage");
      }),
    /outage/,
  );
  assert.equal(await cached("bad", load), 7);
  assert.equal(calls, 3);
});

test("exact saved phrases need no model or database and never guess between brands", async () => {
  const { savedPhrase } = await import("../lib/fast-entry");
  const meal = {
    id: "meal",
    name: "Breakfast bowl",
    items: [{ food, quantity: 150, unit: "g" as const }],
  };
  assert.equal(savedPhrase("log my breakfast bowl", [food], [meal])?.[0].quantity, 150);
  assert.equal(savedPhrase("Blueberries", [food], [])?.[0].quantity, 100);
  assert.equal(savedPhrase("150 g blueberries", [food], []), null);
  assert.equal(savedPhrase("Breakfast bowl but add an egg", [food], [meal]), null);
  const brand = { ...food, id: "brand", brand: "Acme" };
  assert.equal(savedPhrase("Blueberries", [food, brand], []), null);
  assert.equal(savedPhrase("Acme Blueberries", [food, brand], [])?.[0].food.id, "brand");
});
