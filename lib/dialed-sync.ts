import { request } from "./store";
import { readBodyWeights } from "./body-weight";
import { dialedDays, type DialedDay } from "./dialed-payload";
import type { Data } from "./types";
const KEY = "counter.dialed-outbox.v1";
type Pending = { day: DialedDay; fingerprint: string; revision: number };
type Queue = { pending: Record<string, Pending>; sent: Record<string, string>; revision: number };
function read(): Queue {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : { pending: {}, sent: {}, revision: 0 };
}
function status(state: string, message: string) {
  window.dispatchEvent(new CustomEvent("counter-dialed-status", { detail: { state, message } }));
}
export function watchDialedSync(getData: () => Data) {
  let active = true,
    flight = false,
    changed = false,
    timer: ReturnType<typeof setTimeout> | undefined,
    configured: boolean | undefined;
  const update = () => {
    changed = true;
    if (flight) return;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 100);
  };
  async function flush() {
    if (!active || flight) return;
    flight = true;
    changed = false;
    try {
      const data = getData(),
        queue = read();
      for (const day of dialedDays(data.entries, readBodyWeights())) {
        const fingerprint = JSON.stringify(day);
        if (
          queue.sent[day.date] === fingerprint ||
          queue.pending[day.date]?.fingerprint === fingerprint
        )
          continue;
        const revision = (queue.revision = Math.max(Date.now(), queue.revision + 1));
        if (day.nutrition) day.nutrition.revision = revision;
        queue.pending[day.date] = { day, fingerprint, revision };
      }
      localStorage.setItem(KEY, JSON.stringify(queue));
      if (!Object.keys(queue.pending).length) return;
      if (!navigator.onLine) {
        status("pending", "Saved on device · Dialed sync pending");
        return;
      }
      if (configured === undefined) configured = (await request("/api/dialed")).configured;
      if (!configured) return;
      while (active) {
        const latest = read(),
          batch = Object.values(latest.pending)
            .sort((a, b) => b.day.date.localeCompare(a.day.date))
            .slice(0, 20);
        if (!batch.length) {
          status("synced", "Saved · synced to Dialed");
          break;
        }
        status("syncing", "Saved on device · syncing to Dialed");
        await request("/api/dialed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ streamId: data.installationId, days: batch.map((p) => p.day) }),
        });
        const current = read();
        for (const item of batch)
          if (current.pending[item.day.date]?.revision === item.revision) {
            delete current.pending[item.day.date];
            current.sent[item.day.date] = item.fingerprint;
          }
        localStorage.setItem(KEY, JSON.stringify(current));
        if (changed) break;
      }
    } catch (e) {
      if (active)
        status(
          "error",
          "Saved on device · Dialed will retry: " +
            (e instanceof Error ? e.message : "connection failed"),
        );
    } finally {
      flight = false;
      if (active && changed) update();
    }
  }
  const wake = () => {
    if (document.visibilityState === "visible") update();
  };
  window.addEventListener("counter-data-saved", update);
  window.addEventListener("counter-body-saved", update);
  window.addEventListener("online", update);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
  const retry = setInterval(wake, 30000);
  update();
  return () => {
    active = false;
    clearTimeout(timer);
    clearInterval(retry);
    window.removeEventListener("counter-data-saved", update);
    window.removeEventListener("counter-body-saved", update);
    window.removeEventListener("online", update);
    window.removeEventListener("focus", wake);
    document.removeEventListener("visibilitychange", wake);
  };
}
