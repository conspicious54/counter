import test from "node:test";
import assert from "node:assert/strict";
import { lookupFood } from "../lib/food-lookup";
import { rememberLookup } from "../lib/food-cache";
import type { Food, Parsed } from "../lib/types";
test("an unlogged successful lookup is reused offline without another network request", async () => {
  const storage = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  try {
    const food: Food = {
      id: "usda-squash",
      name: "Squash, winter, spaghetti, raw",
      source: "USDA",
      basis: { quantity: 100, unit: "g" },
      nutrients: { calories: 31, protein: 0.64, carbs: 6.91, fat: 0.57 },
    };
    rememberLookup([food]);
    const p: Parsed = {
      name: "spaghetti squash",
      brand: null,
      quantity: 100,
      unit: "g",
      preparation: null,
      action: "add",
    };
    const result = await lookupFood(p, {
      foods: [],
      entries: [],
      online: false,
      database: true,
      search: async () => {
        throw new Error("Network must not be used");
      },
    });
    assert.equal(result.food.id, food.id);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
