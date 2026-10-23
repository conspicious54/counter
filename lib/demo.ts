import type { Food, Parsed } from "./types";
export const demoFoods: Food[] = [
  {
    id: "demo-chicken",
    name: "Chicken breast, cooked",
    source: "Demo",
    preparation: "cooked",
    basis: { quantity: 100, unit: "g" },
    nutrients: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  },
  {
    id: "demo-rice",
    name: "White rice, cooked",
    source: "Demo",
    preparation: "cooked",
    basis: { quantity: 100, unit: "g" },
    nutrients: { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
  },
  {
    id: "demo-egg",
    name: "Egg, large",
    source: "Demo",
    basis: { quantity: 100, unit: "g" },
    nutrients: { calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5 },
    portions: { piece: { quantity: 50, unit: "g" } },
  },
  {
    id: "demo-oats",
    name: "Rolled oats, dry",
    source: "Demo",
    basis: { quantity: 100, unit: "g" },
    nutrients: { calories: 379, protein: 13.2, carbs: 67.7, fat: 6.5 },
  },
  {
    id: "demo-banana",
    name: "Banana",
    source: "Demo",
    basis: { quantity: 100, unit: "g" },
    nutrients: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
    portions: { piece: { quantity: 118, unit: "g" } },
  },
  {
    id: "demo-yogurt",
    name: "Greek yogurt, plain",
    source: "Demo",
    basis: { quantity: 100, unit: "g" },
    nutrients: { calories: 59, protein: 10.2, carbs: 3.6, fat: 0.4 },
  },
  {
    id: "demo-blueberry",
    name: "Blueberries",
    source: "Demo",
    basis: { quantity: 100, unit: "g" },
    nutrients: { calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3 },
  },
  {
    id: "demo-milk",
    name: "Milk, 2%",
    source: "Demo",
    basis: { quantity: 100, unit: "ml" },
    nutrients: { calories: 50, protein: 3.4, carbs: 4.8, fat: 2 },
  },
  {
    id: "demo-peanut",
    name: "Peanut butter",
    source: "Demo",
    basis: { quantity: 100, unit: "g" },
    nutrients: { calories: 588, protein: 25, carbs: 20, fat: 50 },
    portions: { tbsp: { quantity: 16, unit: "g" } },
  },
  {
    id: "demo-cheddar",
    name: "Cheddar cheese",
    source: "Demo",
    basis: { quantity: 100, unit: "g" },
    nutrients: { calories: 403, protein: 24.9, carbs: 1.3, fat: 33.1 },
  },
];
export function demoParse(text: string): Parsed[] {
  const numbers: Record<string, string> = {
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    a: "1",
    an: "1",
  };
  const normalized = text
    .toLowerCase()
    .replace(/\b(one|two|three|four|a|an)\b/g, (x) => numbers[x])
    .replace(/\b(i had|add|log|of)\b/g, "");
  return normalized
    .split(/\s+and\s+|,\s*(?=\d)/)
    .filter(Boolean)
    .map((part) => {
      const m = part
        .trim()
        .match(
          /^(\d+(?:\.\d+)?)\s*(grams?|g\b|milliliters?|ml\b|servings?|pieces?|eggs?|cups?|tablespoons?|tbsp|scoops?|slices?|ounces?|oz\b)?\s*(.*)$/,
        );
      if (!m)
        throw new Error(
          "Demo understands quantities plus sample foods, e.g. “200 g chicken and 100 g rice”. Live natural-language parsing needs an OpenAI key.",
        );
      const u = m[2] || "piece";
      const unit = /^(g|gram)/.test(u)
        ? "g"
        : /^(ml|milliliter)/.test(u)
          ? "ml"
          : /^serving/.test(u)
            ? "serving"
            : /^(tbsp|tablespoon)/.test(u)
              ? "tbsp"
              : /^cup/.test(u)
                ? "cup"
                : /^scoop/.test(u)
                  ? "scoop"
                  : /^slice/.test(u)
                    ? "slice"
                    : /^(oz|ounce)/.test(u)
                      ? "oz"
                      : "piece";
      return {
        name: /^egg/.test(u) ? "egg " + m[3] : m[3],
        quantity: Number(m[1]),
        unit,
        brand: null,
        preparation: /raw/.test(part) ? "raw" : /cooked/.test(part) ? "cooked" : null,
        action: "add",
      };
    });
}
