"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Scale } from "lucide-react";
import {
  bodyScaleAction,
  bodyScaleAvailable,
  readBodyWeights,
  storeBodyWeights,
  type BodyWeight,
} from "@/lib/body-weight";
import { localDay } from "@/lib/nutrition";
export function BodyWeightPanel({ day }: { day?: string }) {
  const [records, setRecords] = useState<BodyWeight[]>([]),
    [native, setNative] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  useEffect(() => {
    setNative(bodyScaleAvailable());
    try {
      setRecords(readBodyWeights());
    } catch (e) {
      setError((e as Error).message);
    }
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || !Array.isArray(detail.records)) return;
      setStatus(typeof detail.status === "string" ? detail.status : "");
      try {
        setRecords(storeBodyWeights(detail.records));
        setError(typeof detail.error === "string" ? detail.error : "");
      } catch {
        setError(
          "Body-weight cache could not save. Your weigh-ins remain in native iPhone storage and will retry.",
        );
      }
    };
    const refresh = () => {
      if (document.visibilityState === "visible") bodyScaleAction("sync");
    };
    window.addEventListener("counter-body", receive);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    bodyScaleAction("sync");
    return () => {
      window.removeEventListener("counter-body", receive);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);
  const filtered = day ? records.filter((r) => localDay(new Date(r.recordedAt)) === day) : records;
  const latest = filtered.at(-1);
  if (!native && !latest && !error) return null;
  return (
    <section className="body-weight-card" aria-label="Body weight">
      <div>
        <strong>Body weight</strong>
        {latest ? (
          <>
            <span className="body-weight-value">
              {(latest.kilograms * 2.2046226218).toFixed(1)} <small>lb</small>
              <span> · {latest.kilograms.toFixed(2)} kg</span>
            </span>
            <time dateTime={latest.recordedAt}>
              {new Date(latest.recordedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              · saved on iPhone
            </time>
          </>
        ) : (
          <small>
            {day ? "No weigh-in on this date." : status || "Connect your bathroom scale once."}
          </small>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      {native && (
        <button
          type="button"
          className="icon-button"
          aria-label="Body weight and bathroom scale settings"
          onClick={() => bodyScaleAction("show")}
        >
          <Scale size={20} />
        </button>
      )}
    </section>
  );
}
export function BodyScaleSettings() {
  const [available, setAvailable] = useState(false);
  useEffect(() => setAvailable(bodyScaleAvailable()), []);
  if (!available) return null;
  return (
    <Button type="button" variant="outline" onClick={() => bodyScaleAction("show")}>
      <Scale size={16} />
      Body weight & bathroom scale
    </Button>
  );
}
