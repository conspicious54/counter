import { NextRequest, NextResponse } from "next/server";
import { guard, failure } from "@/lib/server";
export async function POST(req: NextRequest) {
  try {
    await guard(req, true);
    if (!process.env.OPENAI_API_KEY)
      throw new Error("Voice transcription is unavailable. Please try again later.");
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size > 20 * 1024 * 1024)
      throw new Error("Recording must be under 20 MB.");
    if (!/^(audio\/|video\/mp4)/.test(audio.type)) throw new Error("Unsupported recording type.");
    const body = new FormData();
    body.set("file", audio);
    body.set("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body,
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) throw new Error("Transcription failed. Your recording is retained; try again.");
    const data = await r.json();
    return NextResponse.json({ text: data.text });
  } catch (e) {
    return failure(e);
  }
}
