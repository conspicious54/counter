import type { Candidate } from "./types";
import { scale } from "./nutrition";
const KEY = "still.meal-draft.v1";
export type MealDraft = { items: Candidate[]; name: string; saveAsMeal: boolean; recipeOnly?: boolean };
export function loadMealDraft(): MealDraft | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const draft = JSON.parse(raw) as MealDraft;
  if (!Array.isArray(draft.items) || typeof draft.name !== "string")
    throw new Error("Your meal draft could not be read. It has been kept on this device.");
  return draft;
}
export function saveMealDraft(draft: MealDraft) {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    throw new Error(
      "Meal draft could not be saved. Keep this sheet open and free device storage before leaving.",
    );
  }
}
export function clearMealDraft() {
  localStorage.removeItem(KEY);
}
export function appendIngredients(current: Candidate[], next: Candidate[]): Candidate[] {
  return [...current, ...next];
}
export function recipeItems(items: Candidate[]) {
  if (!items.length) throw new Error("Add at least one ingredient.");
  items.forEach(scale);
  if (items.some((i) => i.warning)) throw new Error("Resolve ingredient matches before saving.");
  return items.map(({ food, quantity, unit }) => ({ food, quantity, unit }));
}
