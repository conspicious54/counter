import type { Food, Item, Recipe } from "./types";
const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
export function savedPhrase(text: string, foods: Food[], recipes: Recipe[]): Item[] | null {
  const phrase = normalize(text).replace(/^(?:(?:log|add)(?: my)?|i had|i ate)\s+/, "");
  const meals = recipes.filter((r) => normalize(r.name) === phrase);
  if (meals.length === 1) return structuredClone(meals[0].items);
  if (meals.length > 1) return null;
  const found = foods.filter(
    (f) =>
      f.source !== "Demo" &&
      (normalize(f.name) === phrase || normalize(`${f.brand || ""} ${f.name}`) === phrase),
  );
  if (found.length !== 1) return null; // Don't guess between brands sharing a name.
  const food = found[0];
  const unit =
    food.basis.unit === "serving" || food.portions?.serving
      ? "serving"
      : food.portions?.piece
        ? "piece"
        : food.basis.unit;
  return [{ food, unit, quantity: unit === "serving" || unit === "piece" ? 1 : 100 }];
}
