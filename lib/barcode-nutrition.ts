import type { Candidate, Food, Nutrients } from "./types";
export const macroKeys = ["calories", "protein", "carbs", "fat"] as const;
export function numeric(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    !(typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()))
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function nutritionCount(food: Food) {
  return macroKeys.filter((k) => food.nutrients[k] !== null).length;
}
export function completeNutrition(food: Food) {
  return nutritionCount(food) === 4;
}
export function missingNutrition(food: Food) {
  return macroKeys.filter((k) => food.nutrients[k] === null);
}
export function sameBarcode(a: string | undefined, b: string | undefined) {
  const first = a?.replace(/^0+/, ""),
    second = b?.replace(/^0+/, "");
  return !!first && !!second && first === second;
}
function energy(n: any, suffix: string) {
  return (
    numeric(n["energy-kcal_" + suffix]) ??
    ((numeric(n["energy-kj_" + suffix]) ?? numeric(n["energy_" + suffix])) === null
      ? null
      : (numeric(n["energy-kj_" + suffix]) ?? numeric(n["energy_" + suffix]))! / 4.184)
  );
}
export function fromOpenFoodFacts(p: any, code: string): Food {
  const n = p.nutriments || {};
  const values = (suffix: string): Nutrients => ({
    calories: energy(n, suffix),
    protein: numeric(n["proteins_" + suffix]),
    carbs: numeric(n["carbohydrates_" + suffix]),
    fat: numeric(n["fat_" + suffix]),
  });
  const match = String(p.serving_size || "").match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
  let servingQuantity = match ? numeric(match[1]) : numeric(p.serving_quantity);
  const servingUnit = (match?.[2] || p.serving_quantity_unit || "").toLowerCase();
  if (!servingQuantity || !["g", "ml"].includes(servingUnit)) servingQuantity = null;
  const volume = ["ml", "l", "cl"].includes(String(p.product_quantity_unit || "").toLowerCase());
  const basisUnit: "g" | "ml" = volume ? "ml" : servingUnit === "ml" ? "ml" : "g";
  const per100 = values("100g"),
    perServing = values("serving");
  if (servingQuantity && servingUnit === basisUnit) {
    for (const key of macroKeys)
      if (per100[key] === null && perServing[key] !== null)
        per100[key] = (perServing[key]! * 100) / servingQuantity;
  }
  const servingOnly =
    macroKeys.filter((k) => perServing[k] !== null).length >
    macroKeys.filter((k) => per100[k] !== null).length;
  return {
    id: "off-" + code,
    barcode: code,
    name: p.product_name || p.product_name_en || "Packaged food",
    brand: p.brands,
    source: "Open Food Facts",
    basis: servingOnly ? { quantity: 1, unit: "serving" } : { quantity: 100, unit: basisUnit },
    nutrients: servingOnly ? perServing : per100,
    portions:
      !servingOnly && servingQuantity && servingUnit === basisUnit
        ? { serving: { quantity: servingQuantity, unit: basisUnit } }
        : {},
  };
}
export function combineBarcodeNutrition(primary: Food, secondary: Food): Food {
  if (!sameBarcode(primary.barcode, secondary.barcode)) return primary;
  let factor: number | null = null;
  if (primary.basis.unit === secondary.basis.unit)
    factor = primary.basis.quantity / secondary.basis.quantity;
  // Only use an explicit serving weight for this exact product. Never infer density.
  else if (
    primary.basis.unit === "serving" &&
    secondary.portions?.serving?.unit === secondary.basis.unit
  )
    factor =
      (primary.basis.quantity * secondary.portions.serving.quantity) / secondary.basis.quantity;
  else if (
    secondary.basis.unit === "serving" &&
    primary.portions?.serving?.unit === primary.basis.unit
  )
    factor =
      primary.basis.quantity / (primary.portions.serving.quantity * secondary.basis.quantity);
  if (factor === null || !Number.isFinite(factor) || factor <= 0)
    return nutritionCount(secondary) > nutritionCount(primary) ? secondary : primary;
  const nutrients = { ...primary.nutrients };
  let changed = false;
  for (const key of macroKeys)
    if (nutrients[key] === null && secondary.nutrients[key] !== null) {
      nutrients[key] = secondary.nutrients[key]! * factor;
      changed = true;
    }
  return changed
    ? {
        ...primary,
        nutrients,
        nutritionSources: [
          ...new Set([
            ...(primary.nutritionSources || [primary.source]),
            ...(secondary.nutritionSources || [secondary.source]),
          ]),
        ],
      }
    : primary;
}
export async function resolveBarcode(
  code: string,
  off: () => Promise<Food | null>,
  usda: () => Promise<Food[]>,
): Promise<Food | null> {
  let food: Food | null = null;
  let failed = false;
  try {
    food = await off();
  } catch {
    failed = true;
  }
  if (food && completeNutrition(food)) return food;
  try {
    const candidates = (await usda())
      .filter((f) => sameBarcode(f.barcode, code))
      .sort((a, b) => nutritionCount(b) - nutritionCount(a));
    for (const f of candidates) {
      food = food ? combineBarcodeNutrition(food, f) : f;
      if (completeNutrition(food)) break;
    }
  } catch {
    failed = true;
  }
  if (!food && failed)
    throw new Error(
      "Barcode databases are unavailable. Please retry or enter the nutrition label.",
    );
  return food;
}

export function barcodeCandidate(food: Food): Candidate {
  const serving = food.basis.unit === "serving" || !!food.portions?.serving;
  return {
    food,
    quantity: serving ? 1 : 100,
    unit: serving ? "serving" : food.basis.unit,
    alternatives: [food],
    ...(nutritionCount(food) === 0
      ? {
          warning:
            "Nutrition is missing from the databases. Enter the label or use an AI estimate.",
        }
      : {}),
  };
}

// OFF uses HTTP 404 for a successful search with no matching product.
export async function readOpenFoodFactsResponse(
  response: Response,
  code: string,
): Promise<Food | null> {
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open Food Facts unavailable (${response.status}).`);
  const data = await response.json();
  return data.status === 1 ? fromOpenFoodFacts(data.product, code) : null;
}
