"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Leaf,
  Minus,
  Moon,
  Plus,
  Settings2,
  Sun,
  Trash2,
  Utensils,
  WifiOff,
  BookOpen,
} from "lucide-react";
import type { Data, Entry, Food, Item, Nutrients, Recipe, Targets, Unit } from "@/lib/types";
import { commit, load, subscribe, sync } from "@/lib/store";
import { dailyTotals, fmt, keys, localDay, scale, supportedUnits, totals } from "@/lib/nutrition";
import { BodyWeightPanel, BodyScaleSettings } from "@/components/body-weight";
import { readBodyWeights } from "@/lib/body-weight";
import { Unlock } from "@/components/unlock";
import { FoodSheet } from "@/components/food-sheet";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
const labels = { calories: "Calories", protein: "Protein", carbs: "Carbs", fat: "Fat" };
export default function Home() {
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState("Saved on this device");
  const [tab, setTab] = useState<"today" | "history">("today");
  const [today, setToday] = useState("");
  const [date, setDate] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [edit, setEdit] = useState<Entry | null>(null);
  const [editQuantity, setEditQuantity] = useState(0);
  const [editUnit, setEditUnit] = useState<Unit>("g");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [theme, setTheme] = useState("system");
  const [config, setConfig] = useState({ ai: false, usda: false, sync: false, locked: false });
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);
  const [group, setGroup] = useState<Entry[] | null>(null);
  const [recipeName, setRecipeName] = useState("");
  useEffect(() => {
    try {
      setData(load());
      setToday(localDay());
      setDate(localDay());
      setReady(true);
    } catch {
      setError("Device storage could not be opened. Enable browser storage to log food safely.");
    }
    const clean = subscribe((d, s) => {
      setData(d);
      setStatus(s);
    });
    const refresh = () => {
      setOnline(navigator.onLine);
      setToday(localDay());
      void sync().catch(() => {});
    };
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(() => setToday(localDay()), 30000);
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
    const savedTheme = localStorage.getItem("still.theme") || "system";
    setTheme(savedTheme);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      clean();
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    const q = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && q.matches),
      );
    apply();
    q.addEventListener("change", apply);
    return () => q.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);
  const selected = tab === "today" ? today : date;
  const entries = useMemo(
    () =>
      data?.entries
        .filter((e) => !e.deleted && e.day === selected)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)) || [],
    [data, selected],
  );
  const total = useMemo(
    () =>
      data ? dailyTotals(data.entries, selected) : { calories: 0, protein: 0, carbs: 0, fat: 0 },
    [data, selected],
  );
  const groups = useMemo(
    () =>
      [...new Set(entries.map((e) => e.groupId))].map((id) => ({
        id,
        entries: entries.filter((e) => e.groupId === id),
      })),
    [entries],
  );
  function save(next: Data) {
    commit(next);
    setData(next);
  }
  function notify(message: string) {
    setToast(message);
  }
  function add(items: Item[]) {
    if (!data) return;
    const current = load();
    items.forEach(scale);
    const groupId = crypto.randomUUID();
    const fresh = items.map((x) => ({
      ...x,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      day: today,
      groupId,
    }));
    const foodMap = new Map([...current.foods, ...items.map((x) => x.food)].map((f) => [f.id, f]));
    save({ ...current, entries: [...current.entries, ...fresh], foods: [...foodMap.values()] });
    notify(items.length > 1 ? "Foods added to today" : "Food added to today");
  }
  function saveFood(food: Food) {
    if (data) save({ ...data, foods: [...data.foods.filter((f) => f.id !== food.id), food] });
  }
  function saveRecipe(recipe: Recipe) {
    if (data) {
      const current = load();
      if (
        current.recipes.some(
          (r) => r.name.trim().toLowerCase() === recipe.name.trim().toLowerCase(),
        )
      )
        throw new Error(
          "A meal with that name already exists. Give this version a different name.",
        );
      const foods = [
        ...new Map(
          [...current.foods, ...recipe.items.map((i) => i.food)].map((f) => [f.id, f]),
        ).values(),
      ];
      save({ ...current, foods, recipes: [...current.recipes, recipe] });
      notify("Meal saved");
    }
  }
  function openEdit(e: Entry) {
    setEdit(e);
    setEditQuantity(e.quantity);
    setEditUnit(e.unit);
    setError("");
  }
  function editEntry(remove = false) {
    if (!data || !edit) return;
    try {
      if (!remove) scale({ ...edit, quantity: editQuantity, unit: editUnit });
      save({
        ...data,
        entries: data.entries.map((e) =>
          e.id === edit.id ? { ...e, quantity: editQuantity, unit: editUnit, deleted: remove } : e,
        ),
      });
      setEdit(null);
      notify(remove ? "Food removed" : "Entry updated");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function shiftDay(amount: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + amount);
    setDate(localDay(d));
  }
  function exportData() {
    if (!data) return;
    const blob = new Blob([JSON.stringify({ ...data, bodyWeights: readBodyWeights() }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `still-backup-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const hasTargets = data ? Object.values(data.targets).some((v) => v > 0) : false;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Still home">
          <span className="brand-mark">
            <Leaf size={17} strokeWidth={1.6} />
          </span>
          still<span className="wordmark-dot">.</span>
        </a>
        <div className="topbar-right">
          <span className={"connection-dot " + (!online ? "offline" : "")} />
          <span className="desktop-label">
            {!online ? "Offline" : config.sync ? "Personal space" : "On your device"}
          </span>
          <button
            className="icon-button settings-button"
            aria-label="Settings and targets"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={18} />
          </button>
        </div>
      </header>
      <main>
        <nav className="screen-tabs" aria-label="Main navigation">
          <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>
            Today
          </button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
            History
          </button>
        </nav>
        {tab === "history" && (
          <div className="date-selector">
            <button className="icon-button" aria-label="Previous day" onClick={() => shiftDay(-1)}>
              <ChevronLeft size={18} />
            </button>
            <input
              type="date"
              aria-label="View date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            <button
              className="icon-button"
              aria-label="Next day"
              disabled={date >= today}
              onClick={() => shiftDay(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
        <section className="dashboard" aria-label="Daily nutrition totals">
          <div className="targets-heading">
            <h2>Macronutrient targets</h2>
            <button className="target-link" onClick={() => setSettings(true)}>
              {hasTargets ? "Edit" : "Set targets"}
              <Settings2 size={14} />
            </button>
          </div>
          <div className="target-rows">
            {keys.map((k) => {
              const amount = ready ? total[k] : null;
              const target = data?.targets[k] || 0;
              const percent =
                amount !== null && target > 0 ? Math.round((amount / target) * 100) : null;
              const unit = k === "calories" ? "kcal" : "g";
              return (
                <div className={"target-row target-" + k} key={k}>
                  <div className="target-row-label">
                    <div>
                      <strong>{labels[k]}</strong>
                      <span>
                        {" "}
                        · {fmt(amount, 1)}
                        {target > 0 ? ` / ${fmt(target, 1)}` : ""} {unit}
                      </span>
                    </div>
                    <span className="target-percentage">
                      {percent !== null ? `${percent}%` : target > 0 ? "—" : "No target"}
                    </span>
                  </div>
                  <div
                    className="target-bar"
                    role={percent !== null ? "progressbar" : undefined}
                    aria-label={`${labels[k]} target`}
                    aria-valuemin={percent !== null ? 0 : undefined}
                    aria-valuemax={percent !== null ? 100 : undefined}
                    aria-valuenow={percent !== null ? Math.min(100, percent) : undefined}
                    aria-valuetext={
                      percent !== null
                        ? `${fmt(amount, 1)} of ${fmt(target, 1)} ${unit}, ${percent}%`
                        : undefined
                    }
                  >
                    <div
                      style={{
                        width: `${percent === null ? 0 : Math.min(100, Math.max(0, percent))}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {keys.some((k) => total[k] === null) && (
            <p className="unknown-note">
              — means a nutrient is missing from a food label; the daily total is incomplete.
            </p>
          )}
        </section>
        <BodyWeightPanel day={tab === "history" ? selected : undefined} />
        <section className="food-section">
          <div className="section-title">
            <h2>
              {tab === "today" ? "On the menu" : "Logged foods"}
              <span>{entries.length}</span>
            </h2>
            {entries.length > 0 && (
              <span className="muted">
                {tab === "today" ? "Your day, bite by bite." : "Every little detail."}
              </span>
            )}
          </div>
          {!entries.length ? (
            <div className="empty-state">
              <span className="empty-icon">
                <Utensils size={25} strokeWidth={1.3} />
              </span>
              <h3>{tab === "today" ? "A fresh start." : "Nothing logged here."}</h3>
              <p>
                {tab === "today"
                  ? "Your first bite goes here. Log something whenever you’re ready."
                  : "Choose another day to see what was on the menu."}
              </p>
              {tab === "today" && (
                <button className="text-button" onClick={() => setAddOpen(true)}>
                  Log your first food
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          ) : (
            <div className="food-groups">
              {groups.map((g, index) => (
                <div className="food-group" key={g.id}>
                  <div className="group-heading">
                    <span>
                      {new Date(g.entries[0].timestamp).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <div>
                      {tab === "history" && (
                        <button
                          aria-label="Copy meal to today"
                          className="text-button"
                          onClick={() => {
                            try {
                              add(g.entries);
                              notify("Meal copied to today");
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          <Copy size={13} />
                          Copy meal
                        </button>
                      )}
                      <button
                        aria-label="Save meal as recipe"
                        className="text-button"
                        onClick={() => {
                          setGroup(g.entries);
                          setRecipeName("");
                        }}
                      >
                        <BookOpen size={13} />
                        <span>Save recipe</span>
                      </button>
                    </div>
                  </div>
                  {g.entries.map((e, i) => {
                    const n = scale(e);
                    return (
                      <button className="food-entry" key={e.id} onClick={() => openEdit(e)}>
                        <span className={"entry-symbol symbol-" + ((index + i) % 4)}>
                          <FoodIcon name={e.food.name} />
                        </span>
                        <span className="entry-details">
                          <strong>{e.food.name}</strong>
                          <span>
                            {fmt(e.quantity, 2)} {e.unit}
                            {e.food.brand ? ` · ${e.food.brand}` : ""}
                            {e.food.source === "AI estimate"
                              ? " · AI estimate"
                              : e.food.source === "Demo"
                                ? " · Demo"
                                : ""}
                          </span>
                          <small>
                            <b>{fmt(n.protein, 1)}</b> P <i>·</i> <b>{fmt(n.carbs, 1)}</b> C{" "}
                            <i>·</i> <b>{fmt(n.fat, 1)}</b> F
                          </small>
                        </span>
                        <span className="entry-calories">
                          {fmt(n.calories)}
                          <small>kcal</small>
                        </span>
                        <ChevronRight size={15} className="entry-chevron" />
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
        <footer className="page-footer">
          <Leaf size={12} />
          <span>Less tracking. More living.</span>
        </footer>
      </main>
      <div className="add-dock">
        <button className="add-food-button" disabled={!data} onClick={() => setAddOpen(true)}>
          <Plus size={21} />
          <span>Add food</span>
          <span className="add-button-hint">Speak, scan, or type</span>
        </button>
        <p>
          {!online ? (
            <>
              <WifiOff size={11} />
              Offline · saved on this device
            </>
          ) : (
            status
          )}
        </p>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {error && !edit && (
        <div className="global-error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {data && (
        <>
          <Unlock
            open={addOpen && config.locked}
            onClose={() => setAddOpen(false)}
            onUnlocked={() => setConfig((c) => ({ ...c, locked: false }))}
          />
          <FoodSheet
            open={addOpen && !config.locked}
            onOpenChange={setAddOpen}
            data={data}
            config={config}
            onAdd={add}
            onFood={saveFood}
            onRecipe={saveRecipe}
          />
        </>
      )}
      <Sheet
        open={!!edit}
        onOpenChange={(v) => !v && setEdit(null)}
        title="A small adjustment."
        description={edit?.food.name}
      >
        {edit && (
          <div className="edit-panel">
            <p className="food-source">
              {edit.food.source === "AI estimate"
                ? "AI estimate"
                : edit.food.brand || edit.food.source}{" "}
              · values per{" "}
              {edit.food.estimate?.referenceLabel ||
                `${edit.food.basis.quantity} ${edit.food.basis.unit}`}
            </p>
            <div className="field-pair">
              <label>
                Quantity
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={editQuantity || ""}
                  onChange={(e) => setEditQuantity(Number(e.target.value))}
                />
              </label>
              <label>
                Unit
                <select value={editUnit} onChange={(e) => setEditUnit(e.target.value as Unit)}>
                  {supportedUnits(edit.food).map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </label>
            </div>
            <EditPreview item={{ ...edit, quantity: editQuantity, unit: editUnit }} />
            <Button className="wide" onClick={() => editEntry()}>
              <Check size={17} />
              Save changes
            </Button>
            {edit.day !== today && (
              <Button
                variant="outline"
                className="wide"
                onClick={() => {
                  try {
                    add([{ ...edit, quantity: editQuantity, unit: editUnit }]);
                    setEdit(null);
                    notify("Food copied to today");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Copy size={16} />
                Copy to today
              </Button>
            )}
            <button className="delete-button" onClick={() => editEntry(true)}>
              <Trash2 size={16} />
              Delete entry
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </Sheet>
      <Sheet
        open={settings}
        onOpenChange={setSettings}
        title="Make it yours."
        description="A few preferences. Nothing more."
      >
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!data) return;
            try {
              const fd = new FormData(e.currentTarget);
              const targets = Object.fromEntries(
                keys.map((k) => [k, Number(fd.get(k) || 0)]),
              ) as Targets;
              save({ ...data, targets });
              setSettings(false);
              notify("Targets updated");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <h3>
            Daily targets <span>optional</span>
          </h3>
          <p className="muted">Leave blank to track without a target.</p>
          <div className="nutrition-grid">
            {keys.map((k) => (
              <label key={k}>
                {labels[k]} <span className="muted">{k === "calories" ? "kcal" : "g"}</span>
                <input
                  name={k}
                  type="number"
                  min="0"
                  max="20000"
                  step="any"
                  defaultValue={data?.targets[k] || ""}
                  placeholder="No target"
                />
              </label>
            ))}
          </div>
          <h3>Appearance</h3>
          <div className="appearance-options">
            {["light", "dark", "system"].map((t) => (
              <button
                type="button"
                key={t}
                className={theme === t ? "selected" : ""}
                onClick={() => {
                  setTheme(t);
                  localStorage.setItem("still.theme", t);
                }}
              >
                {t === "dark" ? <Moon size={16} /> : <Sun size={16} />} {t}
              </button>
            ))}
          </div>
          <Button className="wide">Save preferences</Button>
          <BodyScaleSettings />
          <div className="settings-storage">
            <h3>Your data</h3>
            <p className="muted">
              {status}. This device has a private anonymous identity. No account needed.
            </p>
            <button type="button" className="text-button" onClick={exportData}>
              <ArrowDownToLine size={15} />
              Export a backup
            </button>
            {config.sync && (
              <button
                type="button"
                className="text-button"
                onClick={() => void sync().catch((e) => setError(e.message))}
              >
                Retry cloud sync
                <ArrowRight size={14} />
              </button>
            )}
          </div>
          <div className="integration-status">
            {[
              ["AI transcription & parsing", config.ai],
              ["USDA food search", config.usda],
              ["Anonymous cloud sync", config.sync],
            ].map(([name, enabled]) => (
              <div key={String(name)}>
                <span>{name}</span>
                <span>{enabled ? "Configured" : "Not configured"}</span>
              </div>
            ))}
            <div>
              <span>Open Food Facts barcodes</span>
              <span>Live lookup</span>
            </div>
          </div>
        </form>
      </Sheet>
      <Sheet
        open={!!group}
        onOpenChange={(v) => !v && setGroup(null)}
        title="A meal worth remembering."
        description="Save these foods together. Log them by name next time."
      >
        <form
          className="recipe-save"
          onSubmit={(e) => {
            e.preventDefault();
            if (!group) return;
            try {
              saveRecipe({
                id: crypto.randomUUID(),
                name: recipeName.trim(),
                items: group.map(({ food, quantity, unit }) => ({ food, quantity, unit })),
              });
              setGroup(null);
              notify("Recipe saved");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            Recipe name
            <input
              required
              maxLength={160}
              autoFocus
              placeholder="e.g. My breakfast bowl"
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
            />
          </label>
          <div className="recipe-ingredients">
            {group?.map((e) => (
              <div key={e.id}>
                <span>{e.food.name}</span>
                <small>
                  {e.quantity} {e.unit}
                </small>
              </div>
            ))}
          </div>
          <Button className="wide" disabled={!recipeName.trim()}>
            <BookOpen size={16} />
            Save recipe
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
function EditPreview({ item }: { item: Item }) {
  let n: Nutrients;
  try {
    n = scale(item);
  } catch (e) {
    return <p className="error">{(e as Error).message}</p>;
  }
  return (
    <div className="edit-preview">
      <strong>
        {fmt(n.calories)} <small>kcal</small>
      </strong>
      <p>
        {fmt(n.protein, 1)}g protein · {fmt(n.carbs, 1)}g carbs · {fmt(n.fat, 1)}g fat
      </p>
    </div>
  );
}
function FoodIcon({ name }: { name: string }) {
  if (/rice|oat|yogurt/i.test(name))
    return (
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M5 15h22c0 8-5 12-11 12S5 23 5 15Z" />
        <path d="M4 15h24M10 10l2 2m3-5 1 4m6-2-2 3M11 29h10" />
      </svg>
    );
  if (/chicken|egg/i.test(name))
    return (
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M23 6c6 5 5 16-2 20-5 3-12 0-13-5-1-4 3-6 5-8s5-12 10-7Z" />
        <path d="m11 24-4 3m-1-5-2 3 3 4 4-2" />
      </svg>
    );
  return <Leaf size={23} strokeWidth={1.3} />;
}
