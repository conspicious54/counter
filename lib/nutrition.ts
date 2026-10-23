import type { Food, Item, Nutrients, Entry, Recipe, Unit } from "./types";
export const keys = ["calories", "protein", "carbs", "fat"] as const;
export function scale(item: Item): Nutrients {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0)
    throw new Error("Enter a quantity greater than zero.");
  const { food, quantity, unit } = item;
  let amount = quantity;
  let base: string = unit;
  if (unit === "oz") {
    amount *= 28.349523125;
    base = "g";
  }
  if (base !== food.basis.unit) {
    const portion = food.portions?.[unit];
    if (!portion || portion.unit !== food.basis.unit)
      throw new Error(`No verified ${unit} conversion. Use ${food.basis.unit}.`);
    amount = quantity * portion.quantity;
  }
  return Object.fromEntries(
    keys.map((k) => [
      k,
      food.nutrients[k] === null ? null : (food.nutrients[k]! * amount) / food.basis.quantity,
    ]),
  ) as Nutrients;
}
export function totals(items: Item[]): Nutrients {
  const result: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of items) {
    const n = scale(item);
    for (const k of keys)
      result[k] = result[k] === null || n[k] === null ? null : result[k]! + n[k]!;
  }
  return result;
}
export function localDay(date: Date = new Date(), timezone?: string): string {
  if (!timezone)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map((k) => parts.find((p) => p.type === k)!.value).join("-");
}
export function dailyTotals(entries: Entry[], day: string) {
  return totals(entries.filter((e) => !e.deleted && e.day === day));
}
export function supportedUnits(food: Food): Unit[] {
  return [
    ...new Set([
      food.basis.unit,
      ...Object.keys(food.portions || {}),
      ...(food.basis.unit === "g" ? ["oz"] : []),
    ]),
  ] as Unit[];
}
export function modifyRecipe(
  recipe: Recipe,
  changes: { food: Food; quantity: number; unit: Unit; action: "add" | "remove" | "set" }[],
): Item[] {
  const items = structuredClone(recipe.items);
  for (const c of changes) {
    const i = items.findIndex((x) => x.food.id === c.food.id);
    if (c.action === "remove") {
      if (i >= 0) items.splice(i, 1);
    } else if (c.action === "set") {
      if (i >= 0) items[i] = { food: c.food, quantity: c.quantity, unit: c.unit };
      else items.push({ food: c.food, quantity: c.quantity, unit: c.unit });
    } else if (i >= 0 && items[i].unit === c.unit) items[i].quantity += c.quantity;
    else items.push({ food: c.food, quantity: c.quantity, unit: c.unit });
  }
  return items;
}
export function fmt(n: number | null, digits = 0) {
  return n === null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
}
