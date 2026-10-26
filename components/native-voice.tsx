"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, RotateCcw } from "lucide-react";
import { captureCommand, recordingBlob, subscribeCapture } from "@/lib/native-capture";
import { request } from "@/lib/store";
import { Button } from "./ui/button";

export function NativeVoice({
  onText,
  enabled,
  autoStart = false,
  compact = false,
}: {
  onText: (text: string) => void;
  enabled: boolean;
  autoStart?: boolean;
  compact?: boolean;
}) {
  const [phase, setPhase] = useState("opening");
  const [liveText, setLiveText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const submitted = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ blob: Blob; id: string } | null>(null);
  const [url, setUrl] = useState("");
  const id = useRef("");
  const active = useRef(false);
  const callback = useRef(onText);
  callback.current = onText;
  const transcribing = useRef(false);
  async function transcribe(blob: Blob, recordingId: string) {
    if (transcribing.current) return;
    transcribing.current = true;
    setPhase("transcribing");
    setError("");
    try {
      const form = new FormData();
      form.set("audio", blob, "recording.m4a");
      const result = await request("/api/transcribe", { method: "POST", body: form });
      if (active.current) {
        captureCommand("voice.clear", id.current, { recordingId });
        callback.current(result.text);
        setSaved(null);
      }
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      transcribing.current = false;
      if (active.current) setPhase("idle");
    }
  }
  function start() {
    if (!enabled) {
      setError("Voice transcription is unavailable. Try again later.");
      return;
    }
    setError("");
    setPhase("opening");
    setLiveText("");
    submitted.current = false;
    captureCommand("voice.start", id.current);
  }
  useEffect(() => {
    active.current = true;
    id.current = crypto.randomUUID();
    const unsubscribe = subscribeCapture(id.current, (event) => {
      if (event.type === "recording") {
        setPhase("recording");
        setStreaming(!!event.streaming);
      }
      if (event.type === "partial" && event.text) setLiveText(event.text);
      if (event.type === "transcript" && event.text && !submitted.current) {
        submitted.current = true;
        if (event.recordingId)
          captureCommand("voice.clear", id.current, { recordingId: event.recordingId });
        callback.current(event.text);
      }
      if (event.type === "idle") {
        setPhase("idle");
        if (autoStart && enabled) start();
      }
      if (event.type === "audio" && event.base64 && event.recordingId) {
        try {
          const blob = recordingBlob(event.base64);
          setSaved({ blob, id: event.recordingId });
          setPhase("idle");
          // Recovered recordings wait for Retry; a freshly finished one goes straight through.
          if (event.message !== "recovered") void transcribe(blob, event.recordingId);
          else setError("Your previous recording is saved. Retry transcription or discard it.");
        } catch (e) {
          setPhase("idle");
          setError((e as Error).message);
        }
      }
      if (event.type === "error") {
        setPhase("idle");
        setError(event.message || "Microphone unavailable.");
      }
    });
    captureCommand("voice.recover", id.current);
    return () => {
      active.current = false;
      unsubscribe();
      captureCommand("voice.cancel", id.current);
    };
  }, []);
  useEffect(() => {
    if (!saved) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(saved.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [saved]);
  const busy = phase === "opening" || phase === "finishing" || phase === "transcribing";
  return (
    <div className={"voice-panel" + (compact ? " compact" : "")}>
      <div className={"voice-orbit " + (phase === "recording" ? "is-recording" : "")}>
        <button
          className="mic-button"
          aria-label={
            phase === "recording"
              ? "Stop recording"
              : busy
                ? "Opening or processing recording"
                : "Start recording"
          }
          disabled={busy || !!saved}
          aria-busy={busy}
          onClick={() => {
            if (phase === "recording") {
              setPhase("finishing");
              captureCommand("voice.stop", id.current);
            } else start();
          }}
        >
          {busy ? (
            <Loader2 size={24} className="spin" />
          ) : phase === "recording" ? (
            <Square size={25} fill="currentColor" />
          ) : (
            <Mic size={30} />
          )}
        </button>
      </div>
      <h3 role="status" aria-live="polite">
        {phase === "recording"
          ? "Listening…"
          : phase === "opening"
            ? "Opening microphone…"
            : phase === "finishing"
              ? "Finishing transcript…"
              : phase === "transcribing"
                ? "Transcribing…"
                : "Speak your food"}
      </h3>
      <p>
        {phase === "recording"
          ? streaming
            ? "Tap Stop to find your food"
            : "Pause when finished · tap to stop anytime"
          : phase === "transcribing"
            ? "Your recording is captured. Finding the words…"
            : "Tap the mic to speak"}
      </p>
      {liveText && (
        <p className="live-transcript" aria-live="polite">
          {liveText}
        </p>
      )}
      {saved && (
        <div className="audio-review">
          <audio controls src={url} />
          <Button
            variant="ghost"
            disabled={busy || !enabled}
            onClick={() => void transcribe(saved.blob, saved.id)}
          >
            <RotateCcw size={15} />
            Retry transcription
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              captureCommand("voice.clear", id.current, { recordingId: saved.id });
              setSaved(null);
              setError("");
            }}
          >
            Discard recording
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
