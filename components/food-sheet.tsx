"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import type { Candidate, Data, Food, Item, Parsed, Recipe, Unit } from "@/lib/types";
import { fmt, modifyRecipe, scale, supportedUnits, totals } from "@/lib/nutrition";
import { request } from "@/lib/store";
import { rankFoods, compatible, matchScore } from "@/lib/matching";
import {
  completeNutrition,
  missingNutrition,
  barcodeCandidate,
  nutritionCount,
  combineBarcodeNutrition,
  sameBarcode,
} from "@/lib/barcode-nutrition";
import { lookupFood } from "@/lib/food-lookup";
import { savedPhrase } from "@/lib/fast-entry";
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
import { LabelScan } from "./label-scan";
import { Scanner } from "./scanner";
import { Voice } from "./voice";
import { ScaleControl } from "./scale-control";
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
  const [manualInitial, setManualInitial] = useState<Food | undefined>();
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const [scanner, setScanner] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [alternatives, setAlternatives] = useState<Food[]>([]);
  const [recipeName, setRecipeName] = useState("");
  const [saveRecipe, setSaveRecipe] = useState(false);
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [savedSearch, setSavedSearch] = useState("");
  const [recipeOnly, setRecipeOnly] = useState(false);
  const [weighing, setWeighing] = useState<number | null>(null);
  function receive(items: Candidate[]) {
    setCandidates((previous) => (addingIngredient ? appendIngredients(previous, items) : items));
    setAddingIngredient(false);
    setError("");
  }
  function addIngredient() {
    setWeighing(null);
    setAddingIngredient(true);
    setText("");
    setClarification("");
    setError("");
    setMethod("speak");
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
      setMethod("speak");
      setAddingIngredient(false);
      setWeighing(null);
      setDraftLoaded(true);
      setSavedSearch("");
      setText("");
      setError("");
      setClarification("");
      setManual(false);
      setManualInitial(undefined);
      setManualIndex(null);
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

  const recent = data.foods
    .filter((f) => f.source !== "Demo")
    .sort(
      (a, b) =>
        data.entries.filter((e) => !e.deleted && e.food.id === b.id).length -
        data.entries.filter((e) => !e.deleted && e.food.id === a.id).length,
    )
    .slice(0, 5);
  async function lookup(p: Parsed) {
    return lookupFood(p, {
      foods: data.foods,
      entries: data.entries,
      online: navigator.onLine,
      database: config.usda,
      search: async (query, branded) =>
        (
          await request(
            "/api/search?q=" +
              encodeURIComponent(query) +
              (branded ? "&branded=1" : "") +
              "&unit=" +
              p.unit,
          )
        ).foods,
      ...(config.ai
        ? {
            estimate: async (food: Parsed) =>
              (
                await request("/api/estimate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(food),
                })
              ).food,
          }
        : {}),
    });
  }
  async function parse(value = text) {
    if (!value.trim() || busy) return;
    const saved = savedPhrase(value, data.foods, data.recipes);
    if (saved) {
      setError("");
      setClarification("");
      receive(saved.map((item) => ({ ...item, alternatives: [item.food] })));
      return;
    }
    if (
      !config.ai &&
      !data.recipes.some((r) => value.toLowerCase().includes(r.name.toLowerCase())) &&
      !/\d|\b(and|but|instead|without)\b/i.test(value) &&
      value.trim().split(/\s+/).length <= 6
    ) {
      setBusy(true);
      setError("");
      try {
        receive([
          await lookup({
            name: value.replace(/^(?:i had|i ate|add|log)\s+/i, ""),
            brand: null,
            quantity: 100,
            unit: "g",
            preparation: null,
            action: "add",
          }),
        ]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
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
      const exactRecipe = data.recipes.find(
        (r) =>
          r.name.toLowerCase().trim() ===
          value
            .trim()
            .replace(/^(?:log|add)\s+(?:my\s+)?/i, "")
            .toLowerCase(),
      );
      if (exactRecipe) {
        parsed = { foods: [], recipeName: exactRecipe.name, clarification: null };
      } else if (simple) {
        parsed = { foods: simple, recipeName: null, clarification: null };
      } else if (config.ai && navigator.onLine) {
        parsed = await request("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: value, recipeNames: data.recipes.map((r) => r.name) }),
        });
      } else {
        const recipe = data.recipes.find((r) => value.toLowerCase().includes(r.name.toLowerCase()));
        if (recipe && !/\b(but|instead|without|another|extra)\b/i.test(value)) {
          parsed = { recipeName: recipe.name, clarification: null, foods: [] };
        } else
          throw new Error(
            "Voice and natural-language parsing are unavailable. Try a measured entry such as 100 g blueberries.",
          );
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
          const cached = data.foods
            .filter((f) => sameBarcode(f.barcode, value))
            .sort(
              (a, b) =>
                Number(completeNutrition(b)) - Number(completeNutrition(a)) ||
                Number(b.source === "Custom") - Number(a.source === "Custom") ||
                Number(a.source === "AI estimate") - Number(b.source === "AI estimate"),
            )[0];
          const reusable = cached && cached.source !== "AI estimate" && completeNutrition(cached);
          let f: Food | undefined = cached;
          if (!reusable && navigator.onLine) {
            try {
              const fresh = (await request("/api/barcode?code=" + encodeURIComponent(value)))
                .food as Food | null;
              f = fresh
                ? cached && cached.source !== "AI estimate"
                  ? combineBarcodeNutrition(cached, fresh)
                  : fresh
                : cached;
            } catch (e) {
              if (!cached) throw e;
            }
          }
          if (!f) {
            setError("No product found. Enter its nutrition label once to save it for next time.");
            setManualInitial(undefined);
            setManualIndex(null);
            setManual(true);
            return;
          }
          receive([barcodeCandidate(f)]);
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
        quantity:
          food.basis.unit === "serving" || food.portions?.serving
            ? 1
            : food.portions?.piece
              ? 1
              : 100,
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
      let foods = data.foods.filter(
        (f) => f.source !== "Demo" && f.name.toLowerCase().includes(search.toLowerCase()),
      );
      if (config.usda)
        foods = [
          ...foods,
          ...(await request("/api/search?q=" + encodeURIComponent(search) + "&branded=1")).foods,
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
    invalid = candidates.some(
      (c) => !!c.warning || (!!c.food.barcode && nutritionCount(c.food) === 0),
    );
  } catch {
    invalid = true;
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
      description={candidates.length ? "Review, then add." : "Say it or type it."}
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
          <div className="entry-actions">
            {(
              [
                { id: "speak", label: "Speak", Icon: Mic },
                { id: "scan", label: "Scan barcode", Icon: Barcode },
              ] as const
            )
              .filter(({ id }) => id !== "speak" || method !== "speak")
              .map(({ id, label, Icon }) => (
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
            {method === "scan" && (
              <button
                onClick={() => {
                  setMethod("type");
                  setScanner(false);
                }}
              >
                Type instead
              </button>
            )}
          </div>
          {method !== "scan" && (
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
                placeholder="What did you eat?"
                value={text}
                onFocus={() => setMethod("type")}
                onChange={(e) => setText(e.target.value)}
                rows={2}
              />
              <div className="input-footer">
                <span>One food or a whole meal.</span>
                <button
                  className="send-button"
                  aria-label="Find foods"
                  disabled={busy || !text.trim()}
                >
                  {busy ? <Loader2 className="spin" size={19} /> : <ArrowRight size={19} />}
                </button>
              </div>
            </form>
          )}
          {method === "speak" && (
            <Voice
              autoStart
              compact
              enabled={config.ai}
              onText={(value) => {
                setText(value);
                setMethod("type");
                void parse(value);
              }}
            />
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
              {error && !busy && /^\d{8,14}$/.test(code) && (
                <div className="barcode-form">
                  <Button variant="outline" onClick={() => scanCode(code)}>
                    Retry lookup
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setManualInitial(undefined);
                      setManualIndex(null);
                      setManual(true);
                      setError("");
                    }}
                  >
                    Enter nutrition label
                  </Button>
                </div>
              )}
              {config.ai && (
                <LabelScan
                  disabled={busy}
                  onBusy={setBusy}
                  onRead={(food) => {
                    setManualInitial(food);
                    setManualIndex(null);
                    setManual(true);
                    setScanner(false);
                    setError("");
                  }}
                />
              )}
              <small className="muted">Open Food Facts + USDA · saved labels work offline</small>
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
          <button
            className="text-button manual-link"
            onClick={() => {
              setManualInitial(undefined);
              setManualIndex(null);
              setManual(true);
            }}
          >
            <Plus size={14} />
            Enter nutrition label manually
          </button>
        </>
      )}
      {manual && (
        <ManualFood
          labelScanning={config.ai}
          barcode={manualInitial?.barcode || (method === "scan" ? code : "")}
          initialFood={manualInitial}
          onCancel={() => {
            setManual(false);
            setManualInitial(undefined);
            setManualIndex(null);
          }}
          onSave={(f) => {
            try {
              onFood(f);
              if (manualIndex !== null) {
                setCandidates((previous) =>
                  previous.map((c, index) => {
                    if (index !== manualIndex) return c;
                    try {
                      scale({ ...c, food: f });
                      return { ...c, food: f, warning: undefined, alternatives: [f] };
                    } catch {
                      return barcodeCandidate(f);
                    }
                  }),
                );
              } else choose(f);
              setManual(false);
              setManualInitial(undefined);
              setManualIndex(null);
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
                    onClick={() => {
                      setWeighing(null);
                      setCandidates(candidates.filter((_, idx) => idx !== i));
                    }}
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
                  · per{" "}
                  {c.food.estimate?.referenceLabel ||
                    `${c.food.basis.quantity} ${c.food.basis.unit}`}
                  {c.food.source === "Demo" ? " · SAMPLE NUTRITION" : ""}
                </small>
                {c.food.estimate && (
                  <p className="estimate-note">
                    Approximate macros · {c.food.estimate.assumptions}
                  </p>
                )}
                {c.food.nutritionSources && (
                  <p className="estimate-note">
                    Nutrition from {c.food.nutritionSources.join(" + ")}; same barcode.
                  </p>
                )}
                {missingNutrition(c.food).length > 0 && (
                  <div className="missing-nutrition" role="status">
                    <p>
                      Product identified · missing {missingNutrition(c.food).join(", ")} in this
                      product record.
                    </p>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setManualInitial(c.food);
                        setManualIndex(i);
                        setManual(true);
                      }}
                    >
                      Complete nutrition label
                    </button>
                    {config.ai && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            const result = await request("/api/estimate", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                name: c.food.name,
                                brand: c.food.brand || null,
                                preparation: c.food.preparation || null,
                                quantity: 1,
                                unit: c.food.basis.unit,
                              }),
                            });
                            const food = {
                              ...result.food,
                              barcode: c.food.barcode,
                              ...(result.food.basis.unit === c.food.basis.unit
                                ? { portions: c.food.portions }
                                : {}),
                            };
                            setCandidates((previous) =>
                              previous.map((item, index) =>
                                index === i
                                  ? {
                                      ...barcodeCandidate(food),
                                      quantity: c.quantity,
                                      unit: c.unit,
                                    }
                                  : item,
                              ),
                            );
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Use AI estimate instead
                      </button>
                    )}
                  </div>
                )}
                {warning && config.ai && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        const replacement = await lookup({
                          name: c.food.name,
                          brand: c.food.brand || null,
                          preparation: c.food.preparation || null,
                          quantity: c.quantity,
                          unit: c.unit,
                          action: "add",
                        });
                        setCandidates((previous) =>
                          previous.map((item, index) => (index === i ? replacement : item)),
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Find nutrition for this portion
                  </button>
                )}
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
                {c.food.basis.unit === "g" && (
                  <button
                    className="text-button weigh-button"
                    onClick={() => setWeighing(weighing === i ? null : i)}
                  >
                    {weighing === i ? "Close scale" : "Weigh with scale"}
                  </button>
                )}
                {weighing === i && (
                  <ScaleControl
                    key={c.food.id + "-" + i}
                    foodName={c.food.name}
                    onFinish={() => setWeighing(null)}
                    onWeight={(grams) =>
                      setCandidates((previous) =>
                        previous.map((item, index) =>
                          index === i
                            ? { ...item, quantity: grams, unit: "g", warning: undefined }
                            : item,
                        ),
                      )
                    }
                  />
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
          <Button
            className="wide"
            disabled={invalid || busy || weighing !== null}
            onClick={confirm}
          >
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
  labelScanning = false,
  barcode,
  initialFood,
  onSave,
  onCancel,
}: {
  labelScanning?: boolean;
  barcode: string;
  initialFood?: Food;
  onSave: (food: Food) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  const [reading, setReading] = useState<Food | undefined>();
  const [readingBusy, setReadingBusy] = useState(false);
  const [note, setNote] = useState("");
  const [revision, setRevision] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const draft = reading || initialFood;
  return (
    <form
      key={revision}
      ref={formRef}
      className="manual-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (readingBusy) return;
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
        if (Object.values(nutrients).every((x) => x === null)) {
          setError("Enter at least one nutrition value from the label.");
          return;
        }
        onSave({
          ...(draft?.basis.unit === String(fd.get("unit")) ? { portions: draft?.portions } : {}),
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
      {labelScanning && (
        <LabelScan
          onBusy={setReadingBusy}
          onRead={(food, message) => {
            const current = formRef.current ? new FormData(formRef.current) : null;
            setReading({
              ...food,
              name: food.name || String(current?.get("name") || draft?.name || ""),
              brand: food.brand || String(current?.get("brand") || draft?.brand || ""),
            });
            setNote(message || "Label read. Check the serving size and four values before saving.");
            setError("");
            setRevision((value) => value + 1);
          }}
        />
      )}
      <p className="muted">
        {note ||
          "Photograph the full nutrition panel, including serving size, or enter the four values below. Leave unreadable values blank."}
      </p>
      <label>
        Food name
        <input
          name="name"
          placeholder="Product name"
          defaultValue={draft?.name}
          required
          maxLength={160}
        />
      </label>
      <label>
        Brand <span className="muted">(optional)</span>
        <input name="brand" placeholder="Brand" defaultValue={draft?.brand} maxLength={100} />
      </label>
      <div className="field-pair">
        <label>
          Values per
          <input
            name="basis"
            type="number"
            min="0.01"
            step="any"
            defaultValue={draft?.basis.quantity || 100}
            required
          />
        </label>
        <label>
          Unit
          <select name="unit" defaultValue={draft?.basis.unit || "g"}>
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
            <input
              name={k}
              type="number"
              min="0"
              step="any"
              placeholder="Unknown"
              defaultValue={draft?.nutrients[k as keyof Food["nutrients"]] ?? ""}
            />
          </label>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <Button className="wide" disabled={readingBusy}>
        <Check size={17} />
        Save food & set quantity
      </Button>
      <button type="button" className="text-button back-link" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
