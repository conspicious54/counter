"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Barcode,
  BookOpen,
  Check,
  ChevronDown,
  Loader2,
  Mic,
  Plus,
  Search,
  Trash2,
  Type,
} from "lucide-react";
import type { Candidate, Data, Food, Item, Parsed, Recipe, Unit } from "@/lib/types";
import { demoFoods, demoParse } from "@/lib/demo";
import { fmt, modifyRecipe, scale, supportedUnits, totals } from "@/lib/nutrition";
import { request } from "@/lib/store";
import { rankFoods, compatible, matchScore } from "@/lib/matching";
import { simpleParse } from "@/lib/simple-parse";
import {
  loadMealDraft,
  saveMealDraft,
  clearMealDraft,
  appendIngredients,
  recipeItems,
} from "@/lib/meal-draft";
import { Button } from "./ui/button";
import { Sheet } from "./ui/sheet";
import { Scanner } from "./scanner";
import { Voice } from "./voice";
type Config = { ai: boolean; usda: boolean; sync: boolean };
export function FoodSheet({
  open,
  onOpenChange,
  data,
  config,
  onAdd,
  onFood,
  onRecipe,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: Data;
  config: Config;
  onAdd: (items: Item[]) => void;
  onFood: (f: Food) => void;
  onRecipe: (r: Recipe) => void;
}) {
  const [method, setMethod] = useState<"speak" | "scan" | "type">("speak");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [clarification, setClarification] = useState("");
  const [answer, setAnswer] = useState("");
  const [code, setCode] = useState("");
  const [manual, setManual] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [alternatives, setAlternatives] = useState<Food[]>([]);
  const [recipeName, setRecipeName] = useState("");
  const [saveRecipe, setSaveRecipe] = useState(false);
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [savedSearch, setSavedSearch] = useState("");
  const [foodQuery, setFoodQuery] = useState("");
  const [foodResults, setFoodResults] = useState<Food[]>([]);
  const [recipeOnly, setRecipeOnly] = useState(false);
  function receive(items: Candidate[]) {
    setCandidates((previous) => (addingIngredient ? appendIngredients(previous, items) : items));
    setAddingIngredient(false);
    setFoodResults([]);
    setError("");
  }
  function addIngredient() {
    setAddingIngredient(true);
    setText("");
    setFoodQuery("");
    setFoodResults([]);
    setClarification("");
    setError("");
    setMethod("type");
  }

  useEffect(() => {
    if (open) {
      try {
        const draft = loadMealDraft();
        setCandidates(draft?.items || []);
        setRecipeName(draft?.name || "");
        setSaveRecipe(draft?.saveAsMeal || false);
        setRecipeOnly(draft?.recipeOnly || false);
      } catch (e) {
        setDraftLoaded(false);
        setError((e as Error).message);
        return;
      }
      setAddingIngredient(false);
      setDraftLoaded(true);
      setSavedSearch("");
      setFoodQuery("");
      setFoodResults([]);
      setText("");
      setError("");
      setClarification("");
      setManual(false);
      setEditing(null);
      setScanner(false);
    } else {
      setDraftLoaded(false);
    }
  }, [open]);
  useEffect(() => {
    if (!open || !draftLoaded) return;
    try {
      if (candidates.length)
        saveMealDraft({ items: candidates, name: recipeName, saveAsMeal: saveRecipe, recipeOnly });
      else clearMealDraft();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [open, draftLoaded, candidates, recipeName, saveRecipe, recipeOnly]);

  const recent = [...data.foods]
    .sort(
      (a, b) =>
        data.entries.filter((e) => !e.deleted && e.food.id === b.id).length -
        data.entries.filter((e) => !e.deleted && e.food.id === a.id).length,
    )
    .slice(0, 5);
  async function lookup(p: Parsed) {
    const local = [
      ...data.foods.filter((f) => !config.usda || f.source !== "Demo"),
      ...(!config.usda ? demoFoods : []),
    ];
    let foods = rankFoods(local, p, data.entries);
    const remembered = foods[0];
    if (remembered) {
      try {
        scale({ food: remembered, quantity: p.quantity, unit: p.unit });
        return { food: remembered, quantity: p.quantity, unit: p.unit, alternatives: foods };
      } catch {}
    }
    if (config.usda && navigator.onLine) {
      try {
        const result = await request(
          "/api/search?q=" +
            encodeURIComponent([p.brand, p.name, p.preparation].filter(Boolean).join(" ")) +
            (p.brand ? "&branded=1" : ""),
        );
        foods = [...foods, ...result.foods];
      } catch (e) {
        if (!foods.length) throw e;
      }
    }
    if (config.usda && navigator.onLine && !rankFoods(foods, p, data.entries).length && !p.brand) {
      const fallback = await request("/api/search?branded=1&q=" + encodeURIComponent(p.name));
      foods = [...foods, ...fallback.foods];
    }
    const unique = rankFoods(foods, p, data.entries);
    if (!unique.length)
      throw new Error(
        `No database match for “${p.name}”. Try a clearer name or enter the label manually.`,
      );
    const food = unique[0];
    const candidate: Candidate = { food, quantity: p.quantity, unit: p.unit, alternatives: unique };
    try {
      scale(candidate);
    } catch (e) {
      candidate.warning = (e as Error).message;
    }
    if (
      p.brand &&
      !`${food.brand || ""} ${food.name}`.toLowerCase().includes(p.brand.toLowerCase())
    )
      candidate.warning = "Select the exact brand before logging.";
    return candidate;
  }
  async function parse(value = text) {
    if (!value.trim()) return;
    if (
      !data.recipes.some((r) => value.toLowerCase().includes(r.name.toLowerCase())) &&
      !/\d|\b(and|but|instead|without)\b/i.test(value) &&
      value.trim().split(/\s+/).length <= 6
    ) {
      await searchFood(value.replace(/^(?:i had|i ate|add|log)\s+/i, ""));
      return;
    }
    setBusy(true);
    setError("");
    if (!addingIngredient) setCandidates([]);
    try {
      let parsed: { foods: Parsed[]; recipeName: string | null; clarification: string | null };
      const simple = !data.recipes.some((r) => value.toLowerCase().includes(r.name.toLowerCase()))
        ? simpleParse(value)
        : null;
      if (simple) {
        parsed = { foods: simple, recipeName: null, clarification: null };
      } else if (config.ai && navigator.onLine) {
        parsed = await request("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: value, recipeNames: data.recipes.map((r) => r.name) }),
        });
      } else {
        const recipe = data.recipes.find((r) => value.toLowerCase().includes(r.name.toLowerCase()));
        if (recipe) {
          const modification = value.split(/\bbut\b/i)[1];
          parsed = {
            recipeName: recipe.name,
            clarification: null,
            foods: modification
              ? demoParse(modification.replace(/another/gi, "1").replace(/\b(add|extra)\b/gi, ""))
              : [],
          };
        } else parsed = { foods: demoParse(value), recipeName: null, clarification: null };
      }
      if (parsed.clarification) {
        setClarification(parsed.clarification);
        setText(value);
        return;
      }
      setClarification("");
      const recipe = data.recipes.find((r) => r.name === parsed.recipeName);
      const matched = await Promise.all(
        parsed.foods.map(async (p) => {
          const existing = recipe?.items
            .map((x) => x.food)
            .filter(
              (f) =>
                compatible(f, p) &&
                (!p.brand ||
                  `${f.brand || ""} ${f.name}`.toLowerCase().includes(p.brand.toLowerCase())) &&
                (!p.preparation ||
                  `${f.name} ${f.preparation || ""}`
                    .toLowerCase()
                    .includes(p.preparation.toLowerCase())),
            )
            .sort((a, b) => matchScore(b, p, []) - matchScore(a, p, []))[0];
          return existing
            ? { food: existing, quantity: p.quantity, unit: p.unit, alternatives: [existing] }
            : lookup(p);
        }),
      );
      if (parsed.recipeName && !recipe) throw new Error("Saved recipe not found.");
      if (recipe) {
        const items = modifyRecipe(
          recipe,
          matched.map((c, i) => ({ ...c, action: parsed.foods[i].action })),
        );
        receive(items.map((x) => ({ ...x, alternatives: [x.food] })));
      } else receive(matched);
      if (!matched.length && !recipe)
        throw new Error("No foods found. Add a quantity and a food name.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const scanCode = useCallback(
    (value: string) => {
      setCode(value);
      setScanner(false);
      setBusy(true);
      setError("");
      void (async () => {
        try {
          const cached = data.foods.find((f) => f.barcode === value);
          const f =
            cached || (await request("/api/barcode?code=" + encodeURIComponent(value))).food;
          if (!f) {
            setError("No product found. Enter its nutrition label once to save it for next time.");
            setManual(true);
            return;
          }
          receive([
            {
              food: f,
              quantity: f.portions?.serving ? 1 : 100,
              unit: f.portions?.serving ? "serving" : f.basis.unit,
              alternatives: [f],
            },
          ]);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      })();
    },
    [data.foods, addingIngredient],
  );
  function choose(food: Food) {
    receive([
      {
        food,
        quantity: food.portions?.serving ? 1 : food.portions?.piece ? 1 : 100,
        unit: food.portions?.serving ? "serving" : food.portions?.piece ? "piece" : food.basis.unit,
        alternatives: [food],
      },
    ]);
    setError("");
  }
  async function findAlternatives() {
    setBusy(true);
    setError("");
    try {
      let foods = data.foods.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));
      if (config.usda)
        foods = [
          ...foods,
          ...(await request("/api/search?q=" + encodeURIComponent(search) + "&branded=1")).foods,
        ];
      else
        foods = [
          ...foods,
          ...demoFoods.filter((f) => f.name.toLowerCase().includes(search.toLowerCase())),
        ];
      setAlternatives([...new Map(foods.map((f) => [f.id, f])).values()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  let combined;
  let invalid = false;
  try {
    combined = totals(candidates);
    invalid = candidates.some((c) => !!c.warning);
  } catch {
    invalid = true;
  }
  async function searchFood(query = foodQuery) {
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      const p: Parsed = {
        name: query.trim(),
        brand: null,
        quantity: 100,
        unit: "g",
        preparation: null,
        action: "add",
      };
      let foods = rankFoods([...data.foods, ...(!config.usda ? demoFoods : [])], p, data.entries);
      if (config.usda && navigator.onLine) {
        const result = await request("/api/search?q=" + encodeURIComponent(query));
        foods = rankFoods([...foods, ...result.foods], p, data.entries);
        if (!foods.length) {
          const branded = await request("/api/search?branded=1&q=" + encodeURIComponent(query));
          foods = rankFoods(branded.foods, p, data.entries);
        }
      }
      setFoodResults(foods);
      if (!foods.length)
        throw new Error(
          config.usda
            ? "No exact food found. Try its generic name or enter its label."
            : "Live USDA search is not configured. Search sample foods or enter a nutrition label.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function confirm() {
    try {
      const items = recipeItems(candidates);
      if (saveRecipe) {
        if (!recipeName.trim()) throw new Error("Give your recipe a name.");
        onRecipe({
          id: crypto.randomUUID(),
          name: recipeName.trim(),
          items,
        });
      }
      if (!recipeOnly || !saveRecipe) onAdd(items);
      clearMealDraft();
      setCandidates([]);
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={addingIngredient ? "Add ingredient" : candidates.length ? "Your meal" : "Add food"}
      description={
        candidates.length
          ? "Check the match. Make it yours."
          : "Speak it, scan it, or keep it simple."
      }
    >
      {addingIngredient && candidates.length > 0 && (
        <div className="meal-draft-summary">
          <div>
            <strong>{candidates.length} ingredients in your meal</strong>
            <small>{fmt(totals(candidates).calories)} kcal · draft saved on device</small>
          </div>
          <button className="text-button" onClick={() => setAddingIngredient(false)}>
            Back to meal
          </button>
        </div>
      )}
      {(!candidates.length || addingIngredient) && !manual && (
        <>
          {method !== "type" && (
            <form
              className="ingredient-search"
              onSubmit={(e) => {
                e.preventDefault();
                void searchFood();
              }}
            >
              <input
                aria-label="Search food database"
                placeholder="Find a food, e.g. blueberries"
                value={foodQuery}
                onChange={(e) => setFoodQuery(e.target.value)}
              />
              <Button
                size="icon"
                aria-label="Search food database"
                disabled={busy || !foodQuery.trim()}
              >
                <Search size={17} />
              </Button>
            </form>
          )}
          {foodResults.length > 0 && (
            <div className="food-search-results">
              {foodResults.map((f) => (
                <button key={f.id} onClick={() => choose(f)}>
                  <span>
                    <strong>{f.name}</strong>
                    <small>
                      {f.brand ? f.brand + " · " : ""}
                      {f.source} · {fmt(f.nutrients.calories)} kcal per {f.basis.quantity}{" "}
                      {f.basis.unit}
                    </small>
                  </span>
                  <Plus size={17} />
                </button>
              ))}
            </div>
          )}
          <div className="method-tabs">
            {(
              [
                { id: "speak", label: "Speak", Icon: Mic },
                { id: "scan", label: "Scan", Icon: Barcode },
                { id: "type", label: "Type", Icon: Type },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                className={method === id ? "active" : ""}
                onClick={() => {
                  setMethod(id);
                  setScanner(id === "scan");
                  setError("");
                }}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </div>
          {method === "speak" && (
            <Voice
              enabled={config.ai}
              onText={(value) => {
                setText(value);
                setMethod("type");
                void parse(value);
              }}
            />
          )}
          {method === "type" && (
            <form
              className="type-form"
              onSubmit={(e) => {
                e.preventDefault();
                void parse();
              }}
            >
              <label className="sr-only" htmlFor="food-description">
                What did you eat?
              </label>
              <textarea
                id="food-description"
                autoFocus
                placeholder="What did you eat?"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
              />
              <div className="input-footer">
                <span>
                  {config.ai
                    ? "Natural language. Real nutrition data."
                    : config.usda
                      ? "USDA lookup · simple entries need no AI"
                      : "Local/demo lookup · USDA not configured"}
                </span>
                <button
                  className="send-button"
                  aria-label="Find foods"
                  disabled={busy || !text.trim()}
                >
                  {busy ? <Loader2 className="spin" size={19} /> : <ArrowRight size={19} />}
                </button>
              </div>
              {!config.ai && (
                <button
                  type="button"
                  className="sample-prompt"
                  onClick={() => {
                    setText("200 g chicken and 100 g rice");
                    void parse("200 g chicken and 100 g rice");
                  }}
                >
                  Try “200 g chicken and 100 g rice” <ArrowRight size={13} />
                </button>
              )}
            </form>
          )}
          {method === "scan" && (
            <>
              <div className="scan-container">
                {scanner ? (
                  <Scanner onCode={scanCode} />
                ) : (
                  <Button variant="outline" onClick={() => setScanner(true)}>
                    <Barcode size={18} />
                    Open camera
                  </Button>
                )}
              </div>
              <form
                className="barcode-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  scanCode(code);
                }}
              >
                <input
                  aria-label="Barcode number"
                  placeholder="Or enter barcode number"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button
                  size="icon"
                  disabled={busy || !/^\d{8,14}$/.test(code)}
                  aria-label="Look up barcode"
                >
                  <ArrowRight size={18} />
                </Button>
              </form>
              <small className="muted">Live Open Food Facts lookup · camera requires HTTPS</small>
            </>
          )}
          {clarification && (
            <form
              className="clarification"
              onSubmit={(e) => {
                e.preventDefault();
                void parse(`${text}. Clarification: ${answer}`);
              }}
            >
              <label>
                {clarification}
                <input
                  autoFocus
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Your answer"
                />
              </label>
              <Button disabled={busy || !answer.trim()}>
                Continue
                <ArrowRight size={16} />
              </Button>
            </form>
          )}
          {(recent.length > 0 || data.recipes.length > 0) && (
            <div className="quick-section">
              <div className="eyebrow">
                {data.recipes.length ? "SAVED & FAMILIAR" : "RECENTLY USED"}
              </div>
              {data.recipes.length > 0 && (
                <input
                  aria-label="Search saved meals"
                  className="saved-meal-search"
                  placeholder="Search saved meals"
                  value={savedSearch}
                  onChange={(e) => setSavedSearch(e.target.value)}
                />
              )}
              {data.recipes
                .filter((r) => r.name.toLowerCase().includes(savedSearch.toLowerCase()))
                .slice(0, savedSearch ? 50 : 5)
                .map((r) => (
                  <button
                    className="quick-food"
                    key={r.id}
                    onClick={() => receive(r.items.map((x) => ({ ...x, alternatives: [x.food] })))}
                  >
                    <span className="food-icon">
                      <BookOpen size={17} />
                    </span>
                    <span>
                      <strong>{r.name}</strong>
                      <small>{r.items.length} ingredients · saved recipe</small>
                    </span>
                    <Plus size={17} />
                  </button>
                ))}
              {!savedSearch &&
                recent.map((f) => (
                  <button className="quick-food" key={f.id} onClick={() => choose(f)}>
                    <span className="food-icon">
                      <Plus size={16} />
                    </span>
                    <span>
                      <strong>{f.name}</strong>
                      <small>{f.brand || f.source}</small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                ))}
            </div>
          )}
          <button className="text-button manual-link" onClick={() => setManual(true)}>
            <Plus size={14} />
            Enter nutrition label manually
          </button>
        </>
      )}
      {manual && (
        <ManualFood
          barcode={code}
          onCancel={() => setManual(false)}
          onSave={(f) => {
            try {
              onFood(f);
              choose(f);
              setManual(false);
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}
      {!!candidates.length && !addingIngredient && !manual && (
        <div className="confirmation">
          {candidates.map((c, i) => {
            let n;
            let warning = c.warning;
            try {
              n = scale(c);
            } catch (e) {
              warning = (e as Error).message;
            }
            return (
              <div className="confirm-food" key={i}>
                <div className="confirm-title">
                  <button
                    onClick={() => {
                      setEditing(editing === i ? null : i);
                      setAlternatives(c.alternatives);
                      setSearch(c.food.name);
                    }}
                  >
                    <strong>{c.food.name}</strong>
                    <ChevronDown size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Remove " + c.food.name}
                    onClick={() => setCandidates(candidates.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <small className="food-source">
                  {c.food.brand ? `${c.food.brand} · ` : ""}
                  {c.food.source === "USDA" ? (
                    <a
                      href={`https://fdc.nal.usda.gov/food-details/${c.food.id.replace("usda-", "")}/nutrients`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      USDA ↗
                    </a>
                  ) : c.food.source === "Open Food Facts" ? (
                    <a
                      href={`https://world.openfoodfacts.org/product/${c.food.barcode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Food Facts ↗
                    </a>
                  ) : (
                    c.food.source
                  )}{" "}
                  · per {c.food.basis.quantity} {c.food.basis.unit}
                  {c.food.source === "Demo" ? " · SAMPLE NUTRITION" : ""}
                </small>
                <div className="quantity-line">
                  <input
                    aria-label={"Quantity for " + c.food.name}
                    type="number"
                    min="0.01"
                    step="any"
                    value={c.quantity || ""}
                    onChange={(e) =>
                      setCandidates(
                        candidates.map((x, idx) =>
                          idx === i
                            ? { ...x, quantity: Number(e.target.value), warning: undefined }
                            : x,
                        ),
                      )
                    }
                  />
                  <select
                    aria-label={"Unit for " + c.food.name}
                    value={c.unit}
                    onChange={(e) =>
                      setCandidates(
                        candidates.map((x, idx) =>
                          idx === i
                            ? { ...x, unit: e.target.value as Unit, warning: undefined }
                            : x,
                        ),
                      )
                    }
                  >
                    {[...new Set([c.unit, ...supportedUnits(c.food)])].map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                  <span>{n ? `${fmt(n.calories)} kcal` : "— kcal"}</span>
                </div>
                {n && (
                  <p className="macro-caption">
                    {fmt(n.protein, 1)}g protein <span>·</span> {fmt(n.carbs, 1)}g carbs{" "}
                    <span>·</span> {fmt(n.fat, 1)}g fat
                  </p>
                )}
                {warning && <p className="error">{warning}</p>}
                {editing === i && (
                  <div className="alternatives">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void findAlternatives();
                      }}
                    >
                      <input
                        aria-label="Search alternative food"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <Button size="icon" aria-label="Search matches" disabled={busy}>
                        <Search size={16} />
                      </Button>
                    </form>
                    {alternatives.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => {
                          setCandidates(
                            candidates.map((x, idx) =>
                              idx === i ? { ...x, food: f, warning: undefined } : x,
                            ),
                          );
                          setEditing(null);
                        }}
                      >
                        <span>
                          {f.name}
                          <small>
                            {f.brand || f.source} · per {f.basis.quantity} {f.basis.unit}
                          </small>
                        </span>
                        {f.id === c.food.id && <Check size={17} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <Button
            variant="outline"
            className="wide add-ingredient-button"
            disabled={busy || invalid}
            onClick={addIngredient}
          >
            <Plus size={16} />
            Add another ingredient
          </Button>
          <div className="combined">
            <span>{candidates.length > 1 ? "Combined total" : "Total"}</span>
            <strong>
              {fmt(combined?.calories ?? null)} <small>kcal</small>
            </strong>
          </div>
          {combined && (
            <p className="meal-macros">
              {fmt(combined.protein, 1)}g protein · {fmt(combined.carbs, 1)}g carbs ·{" "}
              {fmt(combined.fat, 1)}g fat
            </p>
          )}
          <label className="recipe-toggle">
            <input
              type="checkbox"
              checked={saveRecipe}
              onChange={(e) => setSaveRecipe(e.target.checked)}
            />
            Save as a reusable meal
          </label>
          {saveRecipe && (
            <input
              aria-label="Recipe name"
              className="full-input"
              placeholder="e.g. Breakfast sandwich"
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
            />
          )}
          {saveRecipe && (
            <label className="recipe-toggle">
              <input
                type="checkbox"
                checked={recipeOnly}
                onChange={(e) => setRecipeOnly(e.target.checked)}
              />
              Save meal only, without logging today
            </label>
          )}
          <Button className="wide" disabled={invalid || busy} onClick={confirm}>
            <Plus size={18} />
            {recipeOnly && saveRecipe
              ? "Save meal"
              : saveRecipe
                ? "Save meal & log today"
                : candidates.length > 1
                  ? "Add all foods"
                  : "Add food"}
          </Button>
          <button
            className="text-button back-link"
            onClick={() => {
              clearMealDraft();
              setCandidates([]);
              setSaveRecipe(false);
              setRecipeOnly(false);
              setError("");
            }}
          >
            Discard meal draft
          </button>
        </div>
      )}
      {busy && (
        <div className="loading-status" role="status">
          <Loader2 size={16} className="spin" />
          Finding your food…
        </div>
      )}
      {error && (
        <p className="error sheet-error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
export function ManualFood({
  barcode,
  onSave,
  onCancel,
}: {
  barcode: string;
  onSave: (food: Food) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <form
      className="manual-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const quantity = Number(fd.get("basis"));
        if (quantity <= 0) return;
        const nutrients = Object.fromEntries(
          ["calories", "protein", "carbs", "fat"].map((k) => {
            const raw = String(fd.get(k) || "");
            return [k, raw.trim() === "" ? null : Number(raw)];
          }),
        ) as Food["nutrients"];
        if (Object.values(nutrients).some((x) => x !== null && (!Number.isFinite(x) || x < 0))) {
          setError("Nutrition values must be zero or greater.");
          return;
        }
        onSave({
          id: "custom-" + crypto.randomUUID(),
          name: String(fd.get("name")).trim(),
          brand: String(fd.get("brand")).trim() || undefined,
          source: "Custom",
          barcode: barcode || undefined,
          basis: { quantity, unit: String(fd.get("unit")) as "g" | "ml" | "serving" },
          nutrients,
        });
      }}
    >
      <p className="muted">
        Copy the nutrition facts from the label. Leave unknown nutrients blank.
      </p>
      <label>
        Food name
        <input name="name" placeholder="Product name" required maxLength={160} />
      </label>
      <label>
        Brand <span className="muted">(optional)</span>
        <input name="brand" placeholder="Brand" maxLength={100} />
      </label>
      <div className="field-pair">
        <label>
          Values per
          <input name="basis" type="number" min="0.01" step="any" defaultValue="100" required />
        </label>
        <label>
          Unit
          <select name="unit">
            <option value="g">grams</option>
            <option value="ml">milliliters</option>
            <option value="serving">serving</option>
          </select>
        </label>
      </div>
      <div className="nutrition-grid">
        {["calories", "protein", "carbs", "fat"].map((k) => (
          <label key={k}>
            {k === "calories" ? "Calories (kcal)" : k + " (g)"}
            <input name={k} type="number" min="0" step="any" placeholder="Unknown" />
          </label>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <Button className="wide">
        <Check size={17} />
        Save food & set quantity
      </Button>
      <button type="button" className="text-button back-link" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
