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
export function compatible(food: Food, p: Parsed) {
  const title = `${food.name} ${food.brand || ""}`.toLowerCase();
  const tokens = foodTokens(p.name);
  const actual = foodTokens(title);
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
