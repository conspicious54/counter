"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Data } from "./types";
const STORAGE = "still.v1";
type RecordRow = { kind: string; id: string; payload: any };
type Envelope = { data: Data; outbox: RecordRow[]; owner?: string };
let envelope: Envelope;
let client: SupabaseClient | null = null;
let inflight: Promise<void> | null = null;
let listener: ((data: Data, status: string) => void) | null = null;
export const emptyData = (): Data => ({
  entries: [],
  foods: [],
  recipes: [],
  targets: { calories: 0, protein: 0, carbs: 0, fat: 0 },
  installationId: crypto.randomUUID(),
});
export function load() {
  const raw = localStorage.getItem(STORAGE);
  envelope = raw ? JSON.parse(raw) : { data: emptyData(), outbox: [] };
  // Retire the old sample catalog without losing a recoverable copy of device data.
  if (
    raw &&
    (envelope.data.entries.some((e) => !e.deleted && e.food.source === "Demo") ||
      envelope.data.foods.some((f) => f.source === "Demo") ||
      envelope.data.recipes.some((r) => r.items.some((i) => i.food.source === "Demo")))
  ) {
    if (!localStorage.getItem("still.sample-backup.v1"))
      localStorage.setItem("still.sample-backup.v1", raw);
    const cleaned = {
      ...envelope.data,
      entries: envelope.data.entries.map((e) =>
        e.food.source === "Demo" ? { ...e, deleted: true } : e,
      ),
      foods: envelope.data.foods.filter((f) => f.source !== "Demo"),
      recipes: envelope.data.recipes.filter((r) => !r.items.some((i) => i.food.source === "Demo")),
    };
    const next = { ...envelope, data: cleaned, outbox: rows(cleaned) };
    localStorage.setItem(STORAGE, JSON.stringify(next));
    envelope = next;
  }
  if (!raw) localStorage.setItem(STORAGE, JSON.stringify(envelope));
  return envelope.data;
}
export function subscribe(fn: typeof listener) {
  listener = fn;
  return () => {
    listener = null;
  };
}
function emit(status: string) {
  listener?.(structuredClone(envelope.data), status);
}
function rows(d: Data): RecordRow[] {
  return [
    ...d.entries.map((x) => ({ kind: "entry", id: x.id, payload: x })),
    ...d.foods.map((x) => ({ kind: "food", id: x.id, payload: x })),
    ...d.recipes.map((x) => ({ kind: "recipe", id: x.id, payload: x })),
    { kind: "targets", id: "targets", payload: d.targets },
  ];
}
export function commit(data: Data) {
  const before = rows(envelope.data);
  const changes = rows(data).filter(
    (r) =>
      JSON.stringify(before.find((x) => x.kind === r.kind && x.id === r.id)?.payload) !==
      JSON.stringify(r.payload),
  );
  const next = {
    ...envelope,
    data,
    outbox: [
      ...envelope.outbox.filter((r) => !changes.some((x) => x.kind === r.kind && x.id === r.id)),
      ...changes,
    ],
  };
  try {
    localStorage.setItem(STORAGE, JSON.stringify(next));
  } catch {
    throw new Error(
      "Device storage is full or unavailable. This change was not saved. Export your data before clearing storage.",
    );
  }
  envelope = next;
  emit(isCloudConfigured() ? "Saved on device · syncing" : "Saved on this device");
  void sync().catch(() => {});
}
export function isCloudConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
export function supabase() {
  if (!isCloudConfigured()) return null;
  if (!client)
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  return client;
}
export async function session() {
  const c = supabase();
  if (!c) return null;
  const { data, error } = await c.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session;
  const signed = await c.auth.signInAnonymously();
  if (signed.error)
    throw new Error(
      "Cloud session unavailable. Entries are safe on this device. Enable anonymous sign-in in Supabase.",
    );
  return signed.data.session;
}
export async function request(path: string, options: RequestInit = {}) {
  const s = await session();
  const r = await fetch(path, {
    ...options,
    headers: {
      ...Object.fromEntries(new Headers(options.headers)),
      ...(s ? { Authorization: `Bearer ${s.access_token}` } : {}),
    },
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || "Request failed. Please retry.");
  return body;
}
export async function sync() {
  if (inflight) return inflight;
  if (!supabase()) {
    emit("Saved on this device");
    return;
  }
  if (!navigator.onLine) {
    emit("Offline · changes saved on device");
    return;
  }
  let succeeded = false;
  inflight = (async () => {
    try {
      const s = await session();
      if (!s) throw new Error("No cloud session.");
      if (envelope.owner && envelope.owner !== s.user.id)
        throw new Error(
          "Cloud identity changed. Local data kept safe; export before reconnecting.",
        );
      if (!envelope.owner) {
        const next = { ...envelope, owner: s.user.id, outbox: rows(envelope.data) };
        localStorage.setItem(STORAGE, JSON.stringify(next));
        envelope = next;
      }
      const batch = structuredClone(envelope.outbox);
      if (batch.length) {
        const { error } = await client!.from("macro_records").upsert(
          batch.map((r) => ({ ...r, user_id: s.user.id })),
          { onConflict: "user_id,kind,id" },
        );
        if (error) throw error;
        const next = {
          ...envelope,
          outbox: envelope.outbox.filter(
            (r) =>
              !batch.some(
                (b) =>
                  b.kind === r.kind &&
                  b.id === r.id &&
                  JSON.stringify(b.payload) === JSON.stringify(r.payload),
              ),
          ),
        };
        localStorage.setItem(STORAGE, JSON.stringify(next));
        envelope = next;
      }
      const { data, error } = await client!.from("macro_records").select("kind,id,payload");
      if (error) throw error;
      const remote = data as RecordRow[];
      const merged = [
        ...remote.filter((r) => !envelope.outbox.some((p) => p.kind === r.kind && p.id === r.id)),
        ...envelope.outbox,
      ];
      const next = {
        ...envelope,
        data: {
          ...envelope.data,
          entries: merged.filter((r) => r.kind === "entry").map((r) => r.payload),
          foods: merged.filter((r) => r.kind === "food").map((r) => r.payload),
          recipes: merged.filter((r) => r.kind === "recipe").map((r) => r.payload),
          targets: merged.find((r) => r.kind === "targets")?.payload || envelope.data.targets,
        },
      };
      localStorage.setItem(STORAGE, JSON.stringify(next));
      envelope = next;
      emit(envelope.outbox.length ? "Saved on device · pending sync" : "All changes synced");
      succeeded = true;
    } catch (e) {
      emit(e instanceof Error ? e.message : "Sync unavailable · saved on device");
      throw e;
    } finally {
      inflight = null;
      if (succeeded && envelope.outbox.length) queueMicrotask(() => void sync().catch(() => {}));
    }
  })();
  return inflight;
}
