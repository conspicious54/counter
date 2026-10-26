"use client";
import { nativeCaptureHandler } from "@/lib/native-capture";
import { NativeVoice } from "./native-voice";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw, Loader2 } from "lucide-react";
import { voiceActivity } from "@/lib/voice-activity";
import { request } from "@/lib/store";
import { Button } from "./ui/button";
export function Voice(props: Parameters<typeof BrowserVoice>[0]) {
  const [native, setNative] = useState<boolean | null>(null);
  useEffect(() => setNative(!!nativeCaptureHandler()), []);
  if (native === null) return <p role="status">Opening microphone…</p>;
  return native ? <NativeVoice {...props} /> : <BrowserVoice {...props} />;
}
function BrowserVoice({
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
  const [phase, setPhase] = useState<
    "idle" | "opening" | "recording" | "finishing" | "transcribing"
  >("idle");
  const recording = phase === "recording";
  const busy = phase === "finishing" || phase === "transcribing";
  const opening = phase === "opening";
  function stop() {
    const r = recorder.current;
    if (!r || r.state !== "recording") return;
    // Acknowledge Stop before waiting for iOS's asynchronous final data/stop events.
    setPhase("finishing");
    if (timer.current) clearTimeout(timer.current);
    stopAnalysis();
    r.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
  }
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
    setPhase("transcribing");
    setError("");
    try {
      const form = new FormData();
      form.set("audio", blob, blob.type.includes("mp4") ? "recording.m4a" : "recording.webm");
      const result = await request("/api/transcribe", { method: "POST", body: form });
      if (active.current) onText(result.text);
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setPhase("idle");
    }
  }
  async function start() {
    if (starting.current || recorder.current?.state === "recording") return;
    starting.current = true;
    setPhase("opening");
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
        setPhase("transcribing");
        const blob = new Blob(chunks, { type: r.mimeType });
        setAudio(blob);
        if (!blob.size) {
          setPhase("idle");
          setError("No audio captured. Try speaking again.");
          return;
        }
        if (enabled) void transcribe(blob);
        else setError("Voice transcription is unavailable. Please try again later.");
      };
      // Collect small chunks during capture instead of packaging the entire recording on Stop.
      r.start(250);
      setAudio(null);
      setPhase("recording");
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
            stop();
            return;
          }
          frame.current = requestAnimationFrame(listen);
        }
        listen();
      } catch {
        /* Manual stop remains available if audio analysis is unsupported. */
      }
      if (r.state === "recording") timer.current = setTimeout(stop, 60000);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (active.current) {
        setPhase("idle");
        setError((e as Error).message);
      }
    } finally {
      starting.current = false;
    }
  }
  return (
    <div className={"voice-panel" + (compact ? " compact" : "")}>
      <div className={"voice-orbit " + (recording ? "is-recording" : "")}>
        <button
          aria-label={
            opening
              ? "Opening microphone"
              : phase === "finishing"
                ? "Recording stopped"
                : phase === "transcribing"
                  ? "Transcribing recording"
                  : recording
                    ? "Stop recording"
                    : "Start recording"
          }
          aria-busy={opening || busy}
          className="mic-button"
          disabled={busy || opening}
          onClick={() => (recording ? stop() : void start())}
        >
          {opening || busy ? (
            <Loader2 size={24} className="spin" />
          ) : recording ? (
            <Square size={25} fill="currentColor" />
          ) : (
            <Mic size={30} />
          )}
        </button>
      </div>
      <h3 role="status" aria-live="polite">
        {opening
          ? "Opening microphone…"
          : phase === "finishing"
            ? "Recording stopped"
            : phase === "transcribing"
              ? "Transcribing…"
              : recording
                ? "Listening…"
                : "Speak your food"}
      </h3>
      <p>
        {opening
          ? "Allow microphone access if asked"
          : busy
            ? "Your recording is captured. Finding the words…"
            : recording
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
