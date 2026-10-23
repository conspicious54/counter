export type Nutrients = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};
export type Unit =
  | "g"
  | "ml"
  | "serving"
  | "piece"
  | "cup"
  | "tbsp"
  | "tsp"
  | "scoop"
  | "slice"
  | "oz";
export type Food = {
  id: string;
  name: string;
  brand?: string;
  source: "USDA" | "Open Food Facts" | "Custom" | "Demo" | "AI estimate";
  estimate?: {
    model: string;
    inputKey: string;
    assumptions: string;
    referenceLabel: string;
    createdAt: string;
  };
  barcode?: string;
  basis: { quantity: number; unit: "g" | "ml" | "serving" };
  nutrients: Nutrients;
  portions?: Partial<Record<Unit, { quantity: number; unit: "g" | "ml" | "serving" }>>;
  preparation?: string;
};
export type Item = { food: Food; quantity: number; unit: Unit };
export type Entry = Item & {
  id: string;
  timestamp: string;
  day: string;
  groupId: string;
  deleted?: boolean;
};
export type Recipe = { id: string; name: string; items: Item[] };
export type Targets = { calories: number; protein: number; carbs: number; fat: number };
export type Data = {
  entries: Entry[];
  foods: Food[];
  recipes: Recipe[];
  targets: Targets;
  installationId: string;
};
export type Parsed = {
  name: string;
  brand: string | null;
  quantity: number;
  unit: Unit;
  preparation: string | null;
  action: "add" | "remove" | "set";
};
export type Candidate = Item & { alternatives: Food[]; warning?: string };
