"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw } from "lucide-react";
import { voiceActivity } from "@/lib/voice-activity";
import { request } from "@/lib/store";
import { Button } from "./ui/button";
export function Voice({
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
  const started = useRef(false);
  const analysis = useRef<AudioContext | null>(null);
  const frame = useRef<number | null>(null);
  const starting = useRef(false);
  function stopAnalysis() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    void analysis.current?.close().catch(() => {});
    analysis.current = null;
  }
  useEffect(() => {
    if (autoStart && enabled && !started.current) {
      started.current = true;
      void start();
    }
  }, [autoStart, enabled]);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const active = useRef(true);
  useEffect(() => {
    if (!audio) {
      setAudioUrl("");
      return;
    }
    const url = URL.createObjectURL(audio);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      stopAnalysis();
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function transcribe(blob: Blob) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("audio", blob, blob.type.includes("mp4") ? "recording.m4a" : "recording.webm");
      const result = await request("/api/transcribe", { method: "POST", body: form });
      if (active.current) onText(result.text);
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function start() {
    if (starting.current || recorder.current?.state === "recording") return;
    starting.current = true;
    setError("");
    try {
      if (!enabled) throw new Error("Voice transcription is unavailable. Please try again later.");
      if (!navigator.mediaDevices || !window.MediaRecorder)
        throw new Error("Recording needs HTTPS and a browser with microphone support.");
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current) {
        stream.current.getTracks().forEach((t) => t.stop());
        return;
      }
      const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const r = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
      recorder.current = r;
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        if (timer.current) clearTimeout(timer.current);
        stream.current?.getTracks().forEach((t) => t.stop());
        if (!active.current) return;
        stopAnalysis();
        setRecording(false);
        const blob = new Blob(chunks, { type: r.mimeType });
        setAudio(blob);
        if (enabled) void transcribe(blob);
        else setError("Voice transcription is unavailable. Please try again later.");
      };
      r.start();
      setAudio(null);
      setRecording(true);
      // Finish after a natural pause, while retaining a manual stop for noisy rooms.
      try {
        const context = new AudioContext();
        analysis.current = context;
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        context.createMediaStreamSource(stream.current).connect(analyser);
        await context.resume();
        const samples = new Float32Array(analyser.fftSize);
        const shouldFinish = voiceActivity();
        function listen() {
          if (r.state !== "recording" || !active.current) return;
          analyser.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
          if (shouldFinish(rms, performance.now())) {
            r.stop();
            return;
          }
          frame.current = requestAnimationFrame(listen);
        }
        listen();
      } catch {
        /* Manual stop remains available if audio analysis is unsupported. */
      }
      timer.current = setTimeout(() => r.state === "recording" && r.stop(), 60000);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError((e as Error).message);
    } finally {
      starting.current = false;
    }
  }
  return (
    <div className={"voice-panel" + (compact ? " compact" : "")}>
      <div className={"voice-orbit " + (recording ? "is-recording" : "")}>
        <button
          aria-label={recording ? "Stop recording" : "Start recording"}
          className="mic-button"
          disabled={busy}
          onClick={() => (recording ? recorder.current?.stop() : void start())}
        >
          {recording ? <Square size={25} fill="currentColor" /> : <Mic size={30} />}
        </button>
      </div>
      <h3>{busy ? "Transcribing…" : recording ? "Listening…" : "Speak your food"}</h3>
      <p>
        {recording
          ? "Pause when finished · tap to stop anytime"
          : compact
            ? "Tap the mic to speak"
            : "“200 grams of chicken and 100 grams of rice.”"}
      </p>
      {audio && error && (
        <div className="audio-review">
          <audio controls src={audioUrl} />
          {enabled && (
            <Button variant="ghost" onClick={() => void transcribe(audio)} disabled={busy}>
              <RotateCcw size={15} />
              Retry transcription
            </Button>
          )}
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
