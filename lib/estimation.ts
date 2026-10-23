import { z } from "zod";
import { estimateReference, estimateKey } from "./estimate-reference";
import type { Food } from "./types";
export const estimateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  brand: z.string().trim().max(160).nullable(),
  preparation: z.string().trim().max(100).nullable(),
  quantity: z.number().positive().max(100000),
  unit: z.enum(["g", "ml", "serving", "piece", "cup", "tbsp", "tsp", "scoop", "slice", "oz"]),
});
export type EstimateInput = z.infer<typeof estimateInputSchema>;
export { estimateReference, estimateKey } from "./estimate-reference";
export const estimateOutputSchema = z.object({
  calories: z.number().min(0).max(50000).nullable(),
  protein: z.number().min(0).max(5000).nullable(),
  carbs: z.number().min(0).max(5000).nullable(),
  fat: z.number().min(0).max(5000).nullable(),
  assumptions: z.string().max(700),
  clarification: z.string().max(200).nullable(),
});
export type EstimateOutput = z.infer<typeof estimateOutputSchema>;
export function estimatedFood(
  p: EstimateInput,
  result: EstimateOutput,
  model: string,
  id: string,
  now = new Date(),
): Food {
  const n = estimateOutputSchema.parse(result),
    ref = estimateReference(p);
  if (n.clarification) throw new Error(n.clarification);
  if (n.calories === null)
    throw new Error(
      "Not enough information to estimate this food. Add a dish description or its label.",
    );
  if (ref.unit === "g" && (n.protein || 0) + (n.carbs || 0) + (n.fat || 0) > 110)
    throw new Error(
      "The estimate had inconsistent quantities. Try describing the dish more clearly.",
    );
  return {
    id,
    name: p.name,
    ...(p.brand ? { brand: p.brand } : {}),
    ...(p.preparation ? { preparation: p.preparation } : {}),
    source: "AI estimate",
    basis: { quantity: ref.quantity, unit: ref.unit },
    nutrients: { calories: n.calories, protein: n.protein, carbs: n.carbs, fat: n.fat },
    ...(ref.unit === "serving" && p.unit !== "serving"
      ? { portions: { [p.unit]: { quantity: 1, unit: "serving" as const } } }
      : {}),
    estimate: {
      model,
      inputKey: estimateKey(p),
      assumptions: n.assumptions,
      referenceLabel: ref.label,
      createdAt: now.toISOString(),
    },
  };
}
