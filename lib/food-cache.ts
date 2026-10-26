import type { Food } from "./types";
const key = "counter.food-lookup-cache.v1";
type Cached = { food: Food; saved: number };
const ttl = 30 * 86400000;
function readCache(): Cached[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const rows: Cached[] = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(
        (row) =>
          row.saved > Date.now() - ttl &&
          typeof row.food?.id === "string" &&
          typeof row.food?.name === "string" &&
          row.food?.basis?.quantity > 0 &&
          ["g", "ml", "serving"].includes(row.food.basis.unit) &&
          row.food.nutrients &&
          ["calories", "protein", "carbs", "fat"].every((key) => {
            const value = row.food.nutrients[key as keyof Food["nutrients"]];
            return (
              value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0)
            );
          }) &&
          ["USDA", "Open Food Facts"].includes(row.food.source),
      )
      .slice(-200);
  } catch {
    return [];
  }
}
export function cachedFoods(): Food[] {
  return readCache().map((row) => row.food);
}
export function rememberLookup(foods: Food[]) {
  try {
    if (typeof localStorage === "undefined") return;
    const rows = new Map(readCache().map((row) => [row.food.id, row]));
    for (const food of foods)
      if (["USDA", "Open Food Facts"].includes(food.source))
        rows.set(food.id, { food, saved: Date.now() });
    localStorage.setItem(key, JSON.stringify([...rows.values()].slice(-200)));
  } catch {
    /* Cache failure must never prevent logging. */
  }
}
