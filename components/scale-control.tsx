"use client";
import { useEffect, useRef, useState } from "react";
import { Bluetooth, Check, Loader2 } from "lucide-react";
import { connectScale, scaleSupport } from "@/lib/scale/connection";
import { usableWeight, type ScaleReading } from "@/lib/scale/etekcity";
import { Button } from "./ui/button";
export function ScaleControl({
  foodName,
  onWeight,
  onFinish,
}: {
  foodName: string;
  onWeight: (grams: number) => void;
  onFinish: () => void;
}) {
  const [status, setStatus] = useState("Disconnected");
  const [reading, setReading] = useState<ScaleReading | null>(null);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [captured, setCaptured] = useState(false);
  const disconnect = useRef<(() => void) | null>(null);
  const active = useRef(true);
  const armedAt = useRef(0);
  const onWeightRef = useRef(onWeight);
  onWeightRef.current = onWeight;
  const trackingRef = useRef(false);
  useEffect(() => {
    active.current = true;
    setSupported(scaleSupport());
    return () => {
      active.current = false;
      disconnect.current?.();
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(
      () => setReading((r) => (r && Date.now() - r.timestamp > 2500 ? null : r)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  async function connect() {
    setError("");
    setStatus("Connecting");
    try {
      disconnect.current?.();
      const cleanup = await connectScale(
        (r) => {
          if (!active.current) return;
          setReading(r);
          if (trackingRef.current && usableWeight(r, armedAt.current)) {
            onWeightRef.current(r.grams!);
            setCaptured(true);
          }
        },
        (s) => {
          if (active.current) {
            setStatus(s);
            if (s === "Disconnected") {
              trackingRef.current = false;
              setTracking(false);
              setReading(null);
            }
          }
        },
      );
      if (active.current) disconnect.current = cleanup;
      else cleanup();
    } catch (e) {
      if (active.current) {
        setStatus("Disconnected");
        setError((e as Error).message);
      }
    }
  }
  function arm() {
    trackingRef.current = true;
    armedAt.current = Date.now();
    setTracking(true);
    setCaptured(false);
    setReading(null);
  }
  return (
    <div className="scale-panel">
      <div className="scale-heading">
        <Bluetooth size={16} />
        <strong>{foodName}</strong>
        <span>{status}</span>
      </div>
      {!supported ? (
        <p>
          To use your Etekcity scale on iPhone, open this in the native Counter app. Safari supports
          manual entry.
        </p>
      ) : status !== "Connected" ? (
        <Button
          variant="outline"
          className="wide"
          onClick={() => void connect()}
          disabled={status === "Connecting"}
        >
          {status === "Connecting" ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <Bluetooth size={15} />
          )}
          Connect Etekcity scale
        </Button>
      ) : (
        <>
          <p>Set the scale to grams. Tare your empty plate, then start weighing this ingredient.</p>
          <div className="scale-live">
            <strong>
              {reading?.grams !== null && reading ? `${reading.grams.toFixed(1)} g` : "— g"}
            </strong>
            <span>
              {reading && reading.grams === null
                ? "Switch scale to grams"
                : reading?.stable
                  ? "Stable"
                  : reading
                    ? "Settling…"
                    : "Waiting for a fresh reading"}
            </span>
          </div>
          {!tracking ? (
            <Button variant="outline" className="wide" onClick={arm}>
              Start automatic weight
            </Button>
          ) : (
            <Button
              variant="outline"
              className="wide"
              onClick={() => {
                trackingRef.current = false;
                setTracking(false);
                onFinish();
              }}
              disabled={!captured}
            >
              <Check size={15} />
              Keep weight & stop tracking
            </Button>
          )}
          {tracking && (
            <small>
              Stable gram readings update this ingredient only. Lift and replace food to send a
              fresh reading.
            </small>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
