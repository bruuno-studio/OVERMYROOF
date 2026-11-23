"use client";

import { useEffect, useRef, useState } from "react";
import {
  computeLateralDistanceKm,
  describeIndoorNoise,
  estimateIndoorDb,
} from "@/lib/humanCopy";
import {
  startJetFlyoverSimulation,
  type FlyoverController,
  type FlyoverPhase,
} from "@/lib/jetAudio";
import type { AuditRecord } from "@/lib/types";

interface FlyoverSimulatorProps {
  audit: AuditRecord;
}

const METER_SEGMENTS = 26;

function formatFriendlyPhase(
  phase: FlyoverPhase,
  liveDb: number,
  insideCone: boolean
): string {
  switch (phase) {
    case "IDLE":
      return "Ready to preview";
    case "APPROACHING":
      return "Plane approaching...";
    case "OVERHEAD_PEAK":
      return insideCone
        ? `Passing directly overhead (~${liveDb} dB)`
        : `Passing nearby to the side (~${liveDb} dB)`;
    case "RECEDING":
      return "Plane fading into the distance...";
    case "VOICE_BRIEFING":
      return "Reading short summary...";
  }
}

export function FlyoverSimulator({ audit }: FlyoverSimulatorProps) {
  const { analysis } = audit;
  const controllerRef = useRef<FlyoverController | null>(null);
  const [phase, setPhase] = useState<FlyoverPhase>("IDLE");
  const [progress, setProgress] = useState(0);
  const [windowClosed, setWindowClosed] = useState(false);
  const [liveDb, setLiveDb] = useState(42);
  const [includeVoice, setIncludeVoice] = useState(true);

  const lateralKm = computeLateralDistanceKm(
    analysis.distanceKm,
    analysis.angleOffsetDeg
  );
  const indoorDb = estimateIndoorDb(analysis.estimatedDb);
  const displayPeakDb = windowClosed ? indoorDb : analysis.estimatedDb;
  const restingFloor = windowClosed ? 28 : 42;

  const opWord =
    analysis.corridorType === "DEPARTURE" ? "taking off from" : "landing at";

  const voiceReadout = analysis.noNearbyAirport
    ? `Airspace check complete. No commercial airports sit within 25 kilometers of this stay, so overhead plane noise should be quiet.`
    : analysis.verdict === "CLEAR_AIRSPACE"
      ? `Airspace check complete. This stay is ${analysis.distanceKm.toFixed(1)} kilometers from ${analysis.airportIata}, outside active landing and takeoff corridors, with quiet outdoor aviation noise around ${analysis.estimatedDb} decibels.`
      : !analysis.insideCone
        ? `Airspace check complete. This stay is ${analysis.distanceKm.toFixed(1)} kilometers from ${analysis.airportIata}, roughly ${lateralKm.toFixed(1)} kilometers to the side of the main runway path. Planes do not pass directly over this roof, with distant outdoor noise around ${analysis.estimatedDb} decibels.`
        : analysis.nightFlights < 2 && analysis.totalDailyMovements < 15
          ? `Airspace check complete. This address aligns with ${analysis.airportIata} Runway ${analysis.runwayName} where planes pass roughly ${analysis.altitudeFeet} feet overhead, though scheduled commercial traffic is currently light with ${analysis.nightFlights} airport-wide overnight flights.`
          : `Airspace check complete. Planes ${opWord} ${analysis.airportIata} pass roughly ${analysis.altitudeFeet} feet above this roof about ${analysis.activeWindPct} percent of the year, with ${analysis.nightFlights} airport-wide flights scheduled between 11 PM and 6 AM.`;

  useEffect(() => {
    return () => {
      controllerRef.current?.stop();
    };
  }, []);

  function handleWindowToggle(closed: boolean) {
    if (phase !== "IDLE") {
      controllerRef.current?.stop();
      controllerRef.current = null;
      setProgress(0);
      setPhase("IDLE");
    }
    setWindowClosed(closed);
    setLiveDb(closed ? 28 : 42);
  }

  function handleTogglePlay() {
    if (phase !== "IDLE") {
      controllerRef.current?.stop();
      controllerRef.current = null;
      setProgress(0);
      setLiveDb(restingFloor);
      setPhase("IDLE");
      return;
    }

    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "sim_play",
        auditId: audit.id,
        meta: {
          estimatedDb: displayPeakDb,
          windowClosed,
          altitudeFeet: analysis.altitudeFeet,
        },
      }),
    }).catch(() => {});

    controllerRef.current = startJetFlyoverSimulation({
      estimatedDb: analysis.estimatedDb,
      altitudeFeet: analysis.altitudeFeet,
      voiceText: voiceReadout,
      includeVoice,
      windowClosed,
      onProgress: (p, db) => {
        setProgress(p);
        setLiveDb(db);
      },
      onPhaseChange: (nextPhase) => {
        setPhase(nextPhase);
      },
      onComplete: () => {
        controllerRef.current = null;
        setProgress(0);
        setLiveDb(restingFloor);
      },
    });
  }

  const isPlaying = phase !== "IDLE";
  const activeBars = Math.max(
    1,
    Math.min(
      METER_SEGMENTS,
      Math.round(((liveDb - 26) / 62) * METER_SEGMENTS)
    )
  );

  const simulatorSubtitle = analysis.insideCone
    ? windowClosed
      ? `Simulated indoor bedroom sound (double-glazed windows closed, ~${indoorDb} dB peak · ${describeIndoorNoise(indoorDb).toLowerCase()}).`
      : `Simulated outdoor jet pass tuned to ~${analysis.altitudeFeet.toLocaleString()} ft overhead and ~${analysis.estimatedDb} dB peak volume.`
    : windowClosed
      ? `Simulated indoor sound with double-glazed windows closed (~${indoorDb} dB peak from distant off-axis airport traffic).`
      : `Simulated distant outdoor jet sound (~${lateralKm.toFixed(1)} km off the main flight path, ~${analysis.estimatedDb} dB peak outdoors).`;

  return (
    <section className="rounded-3xl border border-[#E7E5E4] bg-white p-6 shadow-xs sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#18181B]">
            Hear what airplane noise sounds like here
          </h2>
          <p className="mt-1 text-xs text-[#52525B] sm:text-sm">
            {simulatorSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Outdoor vs Closed Double-Glazed Window Toggle */}
          <div className="inline-flex items-center rounded-full border border-[#E7E5E4] bg-[#FAF9F7] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => handleWindowToggle(false)}
              className={`cursor-pointer rounded-full px-3 py-1 font-semibold transition-colors ${
                !windowClosed
                  ? "bg-[#0F172A] text-white"
                  : "text-[#52525B] hover:text-[#18181B]"
              }`}
            >
              Windows Open
            </button>
            <button
              type="button"
              onClick={() => handleWindowToggle(true)}
              className={`cursor-pointer rounded-full px-3 py-1 font-semibold transition-colors ${
                windowClosed
                  ? "bg-[#0F172A] text-white"
                  : "text-[#52525B] hover:text-[#18181B]"
              }`}
            >
              Closed (~−22 dB)
            </button>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-[#E7E5E4] bg-[#FAF9F7] px-3 py-1.5 text-xs font-medium text-[#3F3F46]">
            <input
              type="checkbox"
              checked={includeVoice}
              onChange={(e) => setIncludeVoice(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-[#0F172A]"
            />
            Voice summary
          </label>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-[#E7E5E4] bg-[#FAF9F7] p-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={handleTogglePlay}
          className={`inline-flex h-12 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold transition-all ${
            isPlaying
              ? "bg-[#DC2626] text-white hover:bg-[#B91C1C]"
              : "bg-[#0284C7] text-white hover:bg-[#0369A1]"
          }`}
        >
          {isPlaying ? "■ Stop Sound" : "▶ Play Flyover Sound"}
        </button>

        {/* Clean Sound Level Meter */}
        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-[#18181B]">
              {formatFriendlyPhase(phase, liveDb, analysis.insideCone)}
            </span>
            <span className="font-data text-xs font-medium text-[#52525B]">
              {isPlaying
                ? `~${liveDb} dB`
                : `Peak ~${displayPeakDb} dB (${windowClosed ? "indoors" : "outdoors"})`}
            </span>
          </div>

          <div className="flex h-7 items-end gap-1 rounded-lg bg-white p-1.5 ring-1 ring-[#E7E5E4]">
            {Array.from({ length: METER_SEGMENTS }).map((_, i) => {
              const lit = isPlaying && i < activeBars;
              const barColor =
                i > 19
                  ? "bg-[#DC2626]"
                  : i > 12
                    ? "bg-[#F59E0B]"
                    : "bg-[#16A34A]";
              return (
                <div
                  key={i}
                  className={`h-full flex-1 rounded-xs transition-opacity ${
                    lit ? `${barColor} opacity-100` : "bg-[#E4E4E7] opacity-60"
                  }`}
                />
              );
            })}
          </div>

          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E4E4E7]">
            <div
              style={{ width: `${Math.round(progress * 100)}%` }}
              className="h-full rounded-full bg-[#0284C7] transition-all duration-75"
            />
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-[#71717A]">
        <span className="font-semibold text-[#52525B]">Voice summary:</span>{" "}
        &ldquo;{voiceReadout}&rdquo;
      </p>
    </section>
  );
}
