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
// A short noun phrase needs a database search, not a model to repeat its name.
// Quantity/prose/recipe modifications remain on the structured parsing path.
export function nameOnlyParse(text: string): Parsed[] | null {
  const name = text
    .trim()
    .replace(/[.!?]+$/, "")
    .trim();
  if (!name || name.split(/\s+/).length > 6 || !/^[a-z][a-z '-]*$/i.test(name)) return null;
  if (
    /\b(some|a|an|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|and|or|with|without|but|instead|another|extra|usual|my|our|i|we|it|its|it's|had|ate|got|went|from|add|log|please|of|serving|servings|cup|cups|tablespoon|teaspoon|slice|slices|scoop|scoops|piece|pieces)\b/i.test(
      name,
    )
  )
    return null;
  return [
    {
      name,
      quantity: 100,
      unit: "g",
      brand: null,
      preparation:
        name.match(/\b(raw|cooked|baked|fried|boiled|steamed|roasted)\b/i)?.[1].toLowerCase() ||
        null,
      action: "add",
    },
  ];
}
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
  const named = nameOnlyParse(clean);
  if (named) return named;
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
