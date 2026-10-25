import type { Food } from "./types";
import {
  readOpenFoodFactsResponse,
  resolveBarcode,
  sameBarcode,
  numeric,
  nutritionCount,
} from "./barcode-nutrition";
import { external } from "./server";
const nutrientIds = { calories: 1008, protein: 1003, carbs: 1005, fat: 1004 };
// USDA foodNutrients are normalized per 100 g, including branded search records.
export function fromUSDA(f: any): Food {
  const nutrients = Object.fromEntries(
    Object.entries(nutrientIds).map(([k, id]) => {
      const ids = k === "calories" ? [1008, 2048, 2047] : [id];
      for (const nutrientID of ids) {
        const n = f.foodNutrients?.find(
          (x: any) => (x.nutrientId ?? x.nutrient?.id) === nutrientID,
        );
        const value = numeric(n?.value ?? n?.amount);
        if (value !== null) return [k, value];
      }
      if (k === "calories") {
        const kj = f.foodNutrients?.find((x: any) => (x.nutrientId ?? x.nutrient?.id) === 1062);
        const value = numeric(kj?.value ?? kj?.amount);
        if (value !== null) return [k, value / 4.184];
      }
      const serving = numeric(f.servingSize);
      const label = numeric(f.labelNutrients?.[k === "carbs" ? "carbohydrates" : k]?.value);
      if (serving && label !== null && ["g", "grm"].includes(f.servingSizeUnit?.toLowerCase()))
        return [k, (label * 100) / serving];
      return [k, null];
    }),
  ) as Food["nutrients"];
  const portions: Food["portions"] = {};
  if (f.servingSize > 0 && ["g", "grm"].includes(f.servingSizeUnit?.toLowerCase()))
    portions.serving = { quantity: f.servingSize, unit: "g" };
  // Only infer count units when USDA explicitly ties its gram serving to that count.
  const household = String(f.householdServingFullText || "")
    .trim()
    .toLowerCase();
  const count = household.match(
    /^(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*(slices?|pieces?|scoops?|cups?|tbsp|tablespoons?|tsp|teaspoons?)\b/,
  );
  if (count && portions.serving) {
    const amount = Number(count[1]) / (count[2] ? Number(count[2]) : 1);
    const label = count[3];
    const unit = label.startsWith("slice")
      ? "slice"
      : label.startsWith("piece")
        ? "piece"
        : label.startsWith("scoop")
          ? "scoop"
          : label.startsWith("cup")
            ? "cup"
            : /^(tbsp|tablespoon)/.test(label)
              ? "tbsp"
              : "tsp";
    if (amount > 0 && Number.isFinite(amount))
      portions[unit] = { quantity: portions.serving.quantity / amount, unit: "g" };
  }
  for (const p of f.foodPortions || []) {
    const label = `${p.modifier || ""} ${p.measureUnit?.name || ""}`.toLowerCase();
    const unit =
      label.includes("large") || label.includes("medium") || label.includes("piece")
        ? "piece"
        : label.includes("tablespoon")
          ? "tbsp"
          : label.includes("teaspoon")
            ? "tsp"
            : label.includes("cup")
              ? "cup"
              : label.includes("slice")
                ? "slice"
                : null;
    if (unit && p.gramWeight > 0 && p.amount > 0)
      portions[unit] = { quantity: p.gramWeight / p.amount, unit: "g" };
  }
  return {
    id: `usda-${f.fdcId}`,
    name: f.description,
    brand: f.brandName || f.brandOwner,
    source: "USDA",
    basis: { quantity: 100, unit: "g" },
    nutrients,
    portions,
  };
}
export async function usdaSearch(query: string, branded = false) {
  if (!process.env.USDA_API_KEY)
    throw new Error("USDA is not configured. Add USDA_API_KEY to search live food data.");
  const data = await external(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(process.env.USDA_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        pageSize: 8,
        ...(branded ? {} : { dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"] }),
      }),
      next: { revalidate: 86400 },
    },
  );
  const foods: Food[] = [];
  for (const f of data.foods || []) {
    foods.push(fromUSDA(f));
  }
  return foods;
}
export async function usdaDetail(food: Food) {
  if (!food.id.startsWith("usda-") || !process.env.USDA_API_KEY) return food;
  const f = await external(
    `https://api.nal.usda.gov/fdc/v1/food/${food.id.slice(5)}?api_key=${encodeURIComponent(process.env.USDA_API_KEY)}`,
    { next: { revalidate: 86400 } },
  );
  return fromUSDA(f);
}
export async function barcodeLookup(code: string): Promise<Food | null> {
  return resolveBarcode(
    code,
    async () => {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,product_name_en,brands,serving_size,serving_quantity,serving_quantity_unit,product_quantity_unit,nutrition_data_per,nutriments`,
        {
          headers: { "User-Agent": "StillMacroTracker/1.0 (personal nutrition logger)" },
          signal: AbortSignal.timeout(10000),
          next: { revalidate: 3600 },
        },
      );
      return readOpenFoodFactsResponse(response, code);
    },
    async () => {
      if (!process.env.USDA_API_KEY) return [];
      const key = encodeURIComponent(process.env.USDA_API_KEY);
      const result = await external(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: code, dataType: ["Branded"], pageSize: 25 }),
        signal: AbortSignal.timeout(10000),
        next: { revalidate: 3600 },
      });
      const exact = (result.foods || [])
        .filter((f: any) => sameBarcode(String(f.gtinUpc || ""), code))
        .sort((a: any, b: any) => nutritionCount(fromUSDA(b)) - nutritionCount(fromUSDA(a)))
        .slice(0, 4);
      return Promise.all(
        exact.map(async (f: any) => {
          try {
            const raw = await external(
              `https://api.nal.usda.gov/fdc/v1/food/${f.fdcId}?api_key=${key}`,
              { signal: AbortSignal.timeout(10000), next: { revalidate: 3600 } },
            );
            if (!sameBarcode(String(raw.gtinUpc || ""), code))
              return { ...fromUSDA(f), barcode: code };
            return { ...fromUSDA(raw), barcode: code };
          } catch {
            return { ...fromUSDA(f), barcode: code };
          }
        }),
      );
    },
  );
}

// One USDA request fetches all portion records needed for a search result list.
export async function usdaDetails(foods: Food[]): Promise<Food[]> {
  const ids = foods.filter((f) => f.id.startsWith("usda-")).map((f) => Number(f.id.slice(5)));
  if (!ids.length || !process.env.USDA_API_KEY) return foods;
  const rows = await external(
    `https://api.nal.usda.gov/fdc/v1/foods?api_key=${encodeURIComponent(process.env.USDA_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fdcIds: ids, format: "full" }),
      next: { revalidate: 86400 },
    },
  );
  const found = new Map<string, Food>(
    (rows as any[]).map((row) => {
      const food = fromUSDA(row);
      return [food.id, food];
    }),
  );
  return foods.map((food) => found.get(food.id) || food);
}
