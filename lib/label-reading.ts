import { z } from "zod";
import type { Food } from "./types";
const number = z.number().min(0).max(100000).nullable();
export const labelSchema = z.object({
  name: z.string().max(160).nullable(),
  brand: z.string().max(100).nullable(),
  basisQuantity: z.number().positive().max(100000).nullable(),
  basisUnit: z.enum(["g", "ml", "serving"]).nullable(),
  servingQuantity: z.number().positive().max(100000).nullable(),
  servingUnit: z.enum(["g", "ml"]).nullable(),
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  note: z.string().max(500).nullable(),
});
export function foodFromLabel(input: unknown): Food {
  const label = labelSchema.parse(input);
  if (!label.basisQuantity || !label.basisUnit)
    throw new Error(
      "Include the serving size and the full nutrition panel in the photo, or enter the values manually.",
    );
  if ([label.calories, label.protein, label.carbs, label.fat].every((n) => n === null))
    throw new Error("Couldn’t read the nutrition label. Try a closer, sharper photo.");
  const massServing = label.basisUnit === "serving" && label.servingQuantity && label.servingUnit;
  return {
    id: "label-reading",
    name: label.name || "",
    brand: label.brand || undefined,
    source: "Custom",
    basis: massServing
      ? { quantity: label.basisQuantity * label.servingQuantity!, unit: label.servingUnit! }
      : { quantity: label.basisQuantity, unit: label.basisUnit },
    nutrients: {
      calories: label.calories,
      protein: label.protein,
      carbs: label.carbs,
      fat: label.fat,
    },
    ...((massServing || label.servingUnit === label.basisUnit) &&
    label.servingQuantity &&
    label.servingUnit
      ? { portions: { serving: { quantity: label.servingQuantity, unit: label.servingUnit } } }
      : {}),
  };
}
export function validateLabelImage(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > 3 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 3 MB.");
  const valid =
    mime === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : mime === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
        : mime === "image/webp"
          ? String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
          : false;
  if (!valid) throw new Error("Choose a JPEG, PNG, or WebP nutrition-label photo.");
}
