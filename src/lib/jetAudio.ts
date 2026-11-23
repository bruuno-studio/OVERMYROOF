export type FlyoverPhase =
  | "IDLE"
  | "APPROACHING"
  | "OVERHEAD_PEAK"
  | "RECEDING"
  | "VOICE_BRIEFING";

export interface FlyoverPlaybackOptions {
  estimatedDb: number;
  altitudeFeet: number;
  voiceText: string;
  includeVoice?: boolean;
  /** Simulate closed double-glazed bedroom window (muffled low-pass attenuation). */
  windowClosed?: boolean;
  onProgress?: (progress: number, instantDb: number) => void;
  onPhaseChange?: (phase: FlyoverPhase) => void;
  onComplete?: () => void;
}

export interface FlyoverController {
  stop: () => void;
}

/**
 * Generates a pink noise AudioBuffer using Paul Kellet's 7-pole approximation.
 * Zero external audio files required.
 */
function createPinkNoiseBuffer(
  ctx: AudioContext,
  durationSeconds: number
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const frameCount = Math.floor(sampleRate * durationSeconds);
  const buffer = ctx.createBuffer(2, frameCount, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const out = buffer.getChannelData(ch);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < frameCount; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
      b6 = white * 0.115926;
    }
  }
  return buffer;
}

/**
 * Pure Web Audio API jet flyover Doppler sweep + optional /api/voice or Web Speech readout.
 */
export function startJetFlyoverSimulation(
  options: FlyoverPlaybackOptions
): FlyoverController {
  const {
    estimatedDb,
    altitudeFeet,
    voiceText,
    includeVoice = true,
    windowClosed = false,
    onProgress,
    onPhaseChange,
    onComplete,
  } = options;

  let stopped = false;
  let rafId: number | null = null;
  let voiceTimeout: ReturnType<typeof setTimeout> | null = null;
  let htmlAudio: HTMLAudioElement | null = null;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();

  // Scale intensity and duration deterministically from dB & altitude (indoor window attenuation = -22 dB + glass low-pass)
  const effectiveDb = windowClosed
    ? Math.max(28, estimatedDb - 22)
    : estimatedDb;
  const clampedDb = Math.max(30, Math.min(88, effectiveDb));
  const ambientFloor = windowClosed ? 28 : 42;
  const intensity = Math.max(0.05, Math.min(1, (clampedDb - 28) / 60));
  const peakGain = windowClosed
    ? Math.max(0.07, Math.min(0.42, 0.06 + intensity * 0.38))
    : Math.max(0.14, Math.min(0.84, 0.12 + intensity * 0.72));
  const durationSec = Math.max(
    4.6,
    Math.min(7.5, 4.6 + (Math.min(altitudeFeet, 3500) / 3500) * 2.8)
  );
  const peakTimeOffset = durationSec * 0.44;
  const now = ctx.currentTime;

  // 1. Pink noise jet exhaust & airframe rush
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = createPinkNoiseBuffer(ctx, durationSec + 0.3);

  // Sweeping bandpass filter (Doppler pitch shift as jet passes overhead)
  const bandFilter = ctx.createBiquadFilter();
  bandFilter.type = "bandpass";
  bandFilter.Q.setValueAtTime(0.75 + (1 - intensity) * 0.4, now);
  const freqScale = windowClosed ? 0.38 : 1;
  const startFreq = (980 + intensity * 620) * freqScale;
  const overheadFreq = (560 + intensity * 260) * freqScale;
  const recedeFreq = (165 + intensity * 75) * freqScale;
  bandFilter.frequency.setValueAtTime(startFreq, now);
  bandFilter.frequency.exponentialRampToValueAtTime(
    overheadFreq,
    now + peakTimeOffset
  );
  bandFilter.frequency.exponentialRampToValueAtTime(
    recedeFreq,
    now + durationSec
  );

  // Secondary low-pass jet rumble body (double glazing blocks highs but lets low rumble through)
  const lowFilter = ctx.createBiquadFilter();
  lowFilter.type = "lowpass";
  lowFilter.frequency.setValueAtTime(
    windowClosed ? 210 + intensity * 120 : 420 + intensity * 380,
    now
  );
  lowFilter.frequency.exponentialRampToValueAtTime(
    windowClosed ? 120 + intensity * 60 : 180 + intensity * 120,
    now + durationSec
  );

  // Stereo panner sweeping left -> right across roof
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(-0.65, now);
  panner.pan.linearRampToValueAtTime(0, now + peakTimeOffset);
  panner.pan.linearRampToValueAtTime(0.68, now + durationSec);

  // Master jet envelope gain
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.001, now);
  noiseGain.gain.exponentialRampToValueAtTime(
    peakGain,
    now + peakTimeOffset
  );
  noiseGain.gain.exponentialRampToValueAtTime(
    peakGain * 0.65,
    now + peakTimeOffset + durationSec * 0.16
  );
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

  // 2. Subtle high-bypass turbofan Doppler whine (only audible on lower flyovers)
  const turbineOsc = ctx.createOscillator();
  turbineOsc.type = "sawtooth";
  const turbineFilter = ctx.createBiquadFilter();
  turbineFilter.type = "bandpass";
  turbineFilter.Q.setValueAtTime(6.0, now);
  const whineStart = 390 + intensity * 140;
  const whineEnd = 245 + intensity * 60;
  turbineOsc.frequency.setValueAtTime(whineStart, now);
  turbineOsc.frequency.exponentialRampToValueAtTime(
    whineEnd,
    now + durationSec
  );
  turbineFilter.frequency.setValueAtTime(whineStart * 1.4, now);
  turbineFilter.frequency.exponentialRampToValueAtTime(
    whineEnd * 1.1,
    now + durationSec
  );

  const turbineGain = ctx.createGain();
  const whinePeak = peakGain * (intensity > 0.45 ? 0.045 : 0.015);
  turbineGain.gain.setValueAtTime(0.0005, now);
  turbineGain.gain.exponentialRampToValueAtTime(
    whinePeak,
    now + peakTimeOffset * 0.92
  );
  turbineGain.gain.exponentialRampToValueAtTime(0.0005, now + durationSec);

  // Wire audio graph
  noiseSource.connect(bandFilter);
  bandFilter.connect(noiseGain);
  noiseSource.connect(lowFilter);
  lowFilter.connect(noiseGain);

  turbineOsc.connect(turbineFilter);
  turbineFilter.connect(turbineGain);
  turbineGain.connect(panner);
  noiseGain.connect(panner);
  panner.connect(ctx.destination);

  noiseSource.start(now);
  turbineOsc.start(now);
  noiseSource.stop(now + durationSec + 0.05);
  turbineOsc.stop(now + durationSec + 0.05);

  onPhaseChange?.("APPROACHING");

  const startMs = performance.now();
  const durationMs = durationSec * 1000;

  function tick() {
    if (stopped) return;
    const elapsed = performance.now() - startMs;
    const progress = Math.min(1, elapsed / durationMs);

    // Compute instantaneous simulated dB envelope
    const peakCenter = 0.44;
    const spread = progress < peakCenter ? 0.24 : 0.32;
    const bell = Math.exp(-Math.pow((progress - peakCenter) / spread, 2));
    const instantDb = Math.round(
      ambientFloor + (clampedDb - ambientFloor) * bell
    );

    if (progress < 0.34) {
      onPhaseChange?.("APPROACHING");
    } else if (progress <= 0.58) {
      onPhaseChange?.("OVERHEAD_PEAK");
    } else {
      onPhaseChange?.("RECEDING");
    }

    onProgress?.(progress, instantDb);

    if (progress < 1) {
      rafId = requestAnimationFrame(tick);
    }
  }
  rafId = requestAnimationFrame(tick);

  async function runVoiceBriefing() {
    if (stopped) return;
    if (!includeVoice) {
      onPhaseChange?.("IDLE");
      onComplete?.();
      return;
    }

    onPhaseChange?.("VOICE_BRIEFING");

    // 1. Try optional server-side TTS endpoint (/api/voice) if configured
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: voiceText }),
      });
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.startsWith("audio/")) {
        if (stopped) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        htmlAudio = new Audio(url);
        htmlAudio.onended = () => {
          URL.revokeObjectURL(url);
          if (!stopped) {
            onPhaseChange?.("IDLE");
            onComplete?.();
          }
        };
        htmlAudio.onerror = () => {
          URL.revokeObjectURL(url);
          speakWithWebSpeech();
        };
        await htmlAudio.play();
        return;
      }
    } catch {
      // Fall cleanly to Web Speech API
    }

    speakWithWebSpeech();
  }

  function speakWithWebSpeech() {
    if (stopped) return;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(voiceText);
        utterance.lang = "en-US";
        utterance.rate = 0.96;
        utterance.pitch = 0.88;
        utterance.onend = () => {
          if (!stopped) {
            onPhaseChange?.("IDLE");
            onComplete?.();
          }
        };
        utterance.onerror = () => {
          if (!stopped) {
            onPhaseChange?.("IDLE");
            onComplete?.();
          }
        };
        window.speechSynthesis.speak(utterance);
        return;
      } catch {
        // Fallback finish
      }
    }
    onPhaseChange?.("IDLE");
    onComplete?.();
  }

  voiceTimeout = setTimeout(() => {
    void runVoiceBriefing();
  }, Math.round(durationMs * 0.92));

  return {
    stop() {
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (voiceTimeout !== null) clearTimeout(voiceTimeout);
      if (htmlAudio) {
        htmlAudio.pause();
        htmlAudio = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      try {
        noiseSource.stop();
        turbineOsc.stop();
      } catch {
        // Already stopped
      }
      void ctx.close().catch(() => { });
      onPhaseChange?.("IDLE");
    },
  };
}
