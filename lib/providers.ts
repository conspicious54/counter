import type { Food } from "./types";
import { external } from "./server";
const nutrientIds = { calories: 1008, protein: 1003, carbs: 1005, fat: 1004 };
// USDA foodNutrients are normalized per 100 g, including branded search records.
export function fromUSDA(f: any): Food {
  const nutrients = Object.fromEntries(
    Object.entries(nutrientIds).map(([k, id]) => {
      const n = f.foodNutrients?.find((x: any) => (x.nutrientId ?? x.nutrient?.id) === id);
      return [k, Number.isFinite(n?.value ?? n?.amount) ? (n.value ?? n.amount) : null];
    }),
  ) as Food["nutrients"];
  const portions: Food["portions"] = {};
  if (f.servingSize > 0 && ["g", "grm"].includes(f.servingSizeUnit?.toLowerCase()))
    portions.serving = { quantity: f.servingSize, unit: "g" };
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
  const data = await external(
    `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,brands,serving_size,serving_quantity,product_quantity_unit,nutriments`,
    { headers: { "User-Agent": "StillMacroTracker/1.0 (personal nutrition logger)" } },
  );
  if (data.status === 1) {
    const p = data.product,
      n = p.nutriments || {};
    const value = (key: string) => (Number.isFinite(n[key]) ? n[key] : null);
    const liquid = p.product_quantity_unit === "ml";
    const basisUnit = liquid ? "ml" : "g";
    const serving = p.serving_size?.match(/([\d.]+)\s*(g|ml)\b/i);
    return {
      id: `off-${code}`,
      barcode: code,
      name: p.product_name || "Packaged food",
      brand: p.brands,
      source: "Open Food Facts",
      basis: { quantity: 100, unit: basisUnit },
      nutrients: {
        calories:
          value("energy-kcal_100g") ??
          (value("energy_100g") === null ? null : value("energy_100g")! / 4.184),
        protein: value("proteins_100g"),
        carbs: value("carbohydrates_100g"),
        fat: value("fat_100g"),
      },
      portions:
        serving && serving[2].toLowerCase() === basisUnit
          ? { serving: { quantity: Number(serving[1]), unit: basisUnit } }
          : {},
    };
  }
  if (process.env.USDA_API_KEY) {
    const foods = await usdaSearch(code, true);
    const exact = foods.find((f) => f.id);
    if (exact) {
      const raw = await external(
        `https://api.nal.usda.gov/fdc/v1/food/${exact.id.slice(5)}?api_key=${encodeURIComponent(process.env.USDA_API_KEY)}`,
      );
      if (String(raw.gtinUpc).replace(/^0+/, "") === code.replace(/^0+/, ""))
        return { ...fromUSDA(raw), barcode: code };
    }
  }
  return null;
}
