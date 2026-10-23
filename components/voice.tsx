"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw } from "lucide-react";
import { request } from "@/lib/store";
import { Button } from "./ui/button";
export function Voice({ onText, enabled }: { onText: (text: string) => void; enabled: boolean }) {
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
    setError("");
    try {
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
        setRecording(false);
        const blob = new Blob(chunks, { type: r.mimeType });
        setAudio(blob);
        if (enabled) void transcribe(blob);
        else
          setError(
            "Recording works. Transcription needs an OpenAI key; use Type to try sample foods.",
          );
      };
      r.start();
      setAudio(null);
      setRecording(true);
      timer.current = setTimeout(() => r.state === "recording" && r.stop(), 60000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="voice-panel">
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
      <h3>
        {busy
          ? "Listening back…"
          : recording
            ? "Go ahead. We’re listening."
            : "Just say what you ate."}
      </h3>
      <p>
        {recording
          ? "Tap to finish · up to 60 seconds"
          : "“200 grams of chicken and 100 grams of rice.”"}
      </p>
      {!enabled && (
        <small className="demo-note">
          Demo mode · recording available, AI transcription not configured
        </small>
      )}
      {audio && (
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
