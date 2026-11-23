import { NextResponse } from "next/server";
import { readServerEnv } from "@/lib/airnodehub";
import { checkScopedRateLimit, extractClientIp } from "@/lib/storage";

/**
 * Optional server-side TTS proxy.
 * If TTS_API_KEY is configured in environment variables (OpenAI-compatible speech endpoint),
 * synthesizes deadpan voice audio. Otherwise returns { available: false } so the client
 * cleanly falls back to the browser's Web Speech API.
 */
export async function POST(request: Request) {
  try {
    const apiKey = readServerEnv("TTS_API_KEY");
    if (!apiKey) {
      return NextResponse.json(
        { available: false, fallback: "web-speech" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const rl = await checkScopedRateLimit({
      scope: "voice",
      clientIp: extractClientIp(request),
      limit: 20,
      windowSeconds: 3600,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { available: false, fallback: "web-speech" },
        { status: 429, headers: { "Retry-After": String(rl.resetSeconds) } }
      );
    }

    const rawText = await request.text();
    if (rawText.length > 1200) {
      return NextResponse.json(
        { error: "Payload too large." },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }

    const body = JSON.parse(rawText) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 600) {
      return NextResponse.json(
        { error: "Text must be between 1 and 600 characters." },
        { status: 400 }
      );
    }

    const ttsUrl =
      readServerEnv("TTS_API_URL") || "https://api.openai.com/v1/audio/speech";
    const ttsModel = readServerEnv("TTS_MODEL") || "tts-1";
    const ttsVoice = readServerEnv("TTS_VOICE") || "onyx";

    const upstream = await fetch(ttsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ttsModel,
        voice: ttsVoice,
        input: text,
        response_format: "mp3",
      }),
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { available: false, fallback: "web-speech" },
        { status: 200 }
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { available: false, fallback: "web-speech" },
      { status: 200 }
    );
  }
}
