import type { Parsed, Unit } from "./types";
import { plainProduce } from "./matching";
// Free deterministic fast path. Complex descriptions fall through to AI; nutrition never comes from parsing.
const unitMap: Record<string, Unit> = {
  g: "g",
  gram: "g",
  grams: "g",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  serving: "serving",
  servings: "serving",
  piece: "piece",
  pieces: "piece",
  cup: "cup",
  cups: "cup",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  slice: "slice",
  slices: "slice",
  scoop: "scoop",
  scoops: "scoop",
};
export function simpleParse(text: string): Parsed[] | null {
  if (/\b(but|instead|usual|without|another|recipe)\b/i.test(text)) return null;
  const clean = text.trim().replace(/^(?:i had|i ate|add|log)\s+/i, "");
  if (plainProduce(clean))
    return [
      {
        name: clean,
        quantity: 100,
        unit: "g",
        brand: null,
        preparation: null,
        action: "add",
      },
    ];
  const parts = clean.split(/\s+and\s+|\s*,\s*/);
  if (parts.length > 20) return null;
  const result: Parsed[] = [];
  for (const part of parts) {
    const m = part
      .trim()
      .match(
        /^(\d+(?:\.\d+)?)\s*(grams?|g|milliliters?|ml|servings?|pieces?|cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|slices?|scoops?)\b\s*(?:of\s+)?(.+)$/i,
      );
    if (!m || Number(m[1]) <= 0 || Number(m[1]) > 100000) return null;
    const name = m[3].trim();
    result.push({
      name,
      quantity: Number(m[1]),
      unit: unitMap[m[2].toLowerCase()],
      brand: null,
      preparation:
        name.match(/\b(raw|cooked|baked|fried|boiled|steamed|roasted)\b/i)?.[1].toLowerCase() ||
        null,
      action: "add",
    });
  }
  return result.length ? result : null;
}
