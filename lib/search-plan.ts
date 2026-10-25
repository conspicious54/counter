import type { Food } from "./types";
import { completeNutrition } from "./barcode-nutrition";
export function needsSearchDetail(food: Food, unit: string | null) {
  return !(["g", "oz"].includes(unit || "") && food.basis.unit === "g" && completeNutrition(food));
}
