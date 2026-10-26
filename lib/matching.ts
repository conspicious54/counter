import type { Entry, Food, Parsed } from "./types";
const ignored = new Set(["the", "of", "food", "large", "medium", "small", "fresh"]);
const stem = (word: string) =>
  word === "berries"
    ? "berry"
    : word.endsWith("ies")
      ? word.slice(0, -3) + "y"
      : word.replace(/s$/, "");
export function foodTokens(name: string) {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !ignored.has(w))
    .map(stem);
}
// Recognize plain produce only when every word is an ingredient/physical modifier.
// Restaurant dishes, brands and flavored products still use normal parsing.
const produce = new Set([
  "cherry",
  "blueberry",
  "strawberry",
  "raspberry",
  "blackberry",
  "banana",
  "apple",
  "orange",
  "grape",
  "peach",
  "pear",
  "mango",
  "pineapple",
  "watermelon",
  "avocado",
]);
const produceModifiers = new Set([
  "black",
  "dark",
  "red",
  "green",
  "yellow",
  "sweet",
  "sour",
  "tart",
  "raw",
  "fresh",
  "frozen",
  "organic",
  "pitted",
  "seedless",
  "whole",
]);
export function plainProduce(name: string): string | null {
  if (/\d/.test(name)) return null;
  const tokens = foodTokens(name);
  const fruits = tokens.filter((word) => produce.has(word));
  return fruits.length === 1 &&
    tokens.every((word) => produce.has(word) || produceModifiers.has(word))
    ? fruits[0]
    : null;
}
export function genericProduceQuery(p: Parsed): string | null {
  if (p.brand) return null;
  const fruit = plainProduce(p.name);
  if (!fruit) return null;
  if (fruit === "cherry") {
    const kind = /\b(sour|tart)\b/i.test(p.name) ? "sour" : "sweet";
    return (
      "cherries " + kind + " " + (p.preparation || (/\bfrozen\b/i.test(p.name) ? "frozen" : "raw"))
    );
  }
  return p.name + (p.preparation || /\b(raw|frozen)\b/i.test(p.name) ? "" : " raw");
}
export function compatible(food: Food, p: Parsed) {
  const title = `${food.name} ${food.brand || ""}`.toLowerCase();
  const fruit = !p.brand ? plainProduce(p.name) : null;
  const tokens = fruit ? [fruit] : foodTokens(p.name);
  const actual = foodTokens(title);
  if (fruit) {
    // A fruit flavor is not the fruit itself, even when it's the only result.
    if (
      /\b(yogurt|yoghurt|juice|drink|beverage|pie|muffin|jam|jelly|sauce|candy|sorbet|salad|cereal|bar|bars|ice cream|syrup|preserves|filling|puree|purée|dried|dehydrated|canned)\b/i.test(
        title,
      ) &&
      !foodTokens(p.name).some((word) => ["dried", "canned"].includes(word))
    )
      return false;
    if (
      fruit === "cherry" &&
      !/\b(sour|tart)\b/i.test(p.name) &&
      /\b(sour|tart|surinam|pitanga)\b/i.test(title)
    )
      return false;
    if (!/\bfrozen\b/i.test(p.name) && /\bfrozen\b/i.test(title)) return false;
    if (/\bfrozen\b/i.test(p.name) && !/\bfrozen\b/i.test(title)) return false;
  }
  if (!tokens.length || !tokens.every((w) => actual.includes(w))) return false;
  const brandKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (p.brand && !brandKey(title).includes(brandKey(p.brand))) return false;
  const requestedSize = p.name.toLowerCase().match(/\b(small|medium|large)\b/)?.[1];
  const actualSize = title.match(/\b(small|medium|large)\b/)?.[1];
  if (requestedSize && actualSize && requestedSize !== actualSize) return false;
  const preparation = p.preparation?.toLowerCase();
  if (preparation && !`${title} ${food.preparation || ""}`.includes(preparation)) return false;
  return true;
}
export function matchScore(food: Food, p: Parsed, entries: Entry[] = []) {
  if (!compatible(food, p)) return -Infinity;
  const title = food.name.toLowerCase();
  let score = 10 + (p.brand ? 30 : 0) + (p.preparation ? 15 : 0);
  const requested = foodTokens(p.name + " " + (p.preparation || ""));
  for (const word of [
    "dried",
    "sweetened",
    "syrup",
    "juice",
    "muffin",
    "pie",
    "fried",
    "baked",
    "frozen",
  ])
    if (title.includes(word) && !requested.includes(word)) score -= 12;
  if (!p.brand && food.brand) score -= 15;
  score -= Math.max(0, foodTokens(food.name).length - requested.length);
  if (!p.preparation && /\braw\b/.test(title)) score += 5;
  score += Math.min(5, entries.filter((e) => !e.deleted && e.food.id === food.id).length);
  return score;
}
export function rankFoods(foods: Food[], p: Parsed, entries: Entry[] = []) {
  return [...new Map(foods.filter((f) => compatible(f, p)).map((f) => [f.id, f])).values()].sort(
    (a, b) =>
      Number(a.source === "AI estimate") - Number(b.source === "AI estimate") ||
      matchScore(b, p, entries) - matchScore(a, p, entries),
  );
}
