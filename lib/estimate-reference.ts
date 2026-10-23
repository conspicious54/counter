import type { Parsed, Unit } from "./types";
export function estimateReference(p: Pick<Parsed, "unit">): {
  quantity: number;
  unit: "g" | "ml" | "serving";
  label: string;
  originalUnit: Unit;
} {
  if (p.unit === "g" || p.unit === "oz")
    return { quantity: 100, unit: "g", label: "100 g", originalUnit: "g" };
  if (p.unit === "ml") return { quantity: 100, unit: "ml", label: "100 ml", originalUnit: "ml" };
  return { quantity: 1, unit: "serving", label: "1 " + p.unit, originalUnit: p.unit };
}
const normalize = (s: string | null) => s?.toLowerCase().trim().replace(/\s+/g, " ") || "";
export function estimateKey(p: Omit<Parsed, "action">) {
  return JSON.stringify([
    "estimate-v1",
    normalize(p.name),
    normalize(p.brand),
    normalize(p.preparation),
    estimateReference(p).originalUnit,
  ]);
}
