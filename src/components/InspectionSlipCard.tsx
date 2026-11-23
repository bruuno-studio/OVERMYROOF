"use client";

import { useState } from "react";
import { FlightPathMap } from "@/components/FlightPathMap";
import { NegotiationModal } from "@/components/NegotiationModal";
import { OVERHEAD_DISCLAIMER } from "@/lib/corridor";
import { downloadAuditReportPng } from "@/lib/exportReportPng";
import {
  buildPlainSummary,
  computeLateralDistanceKm,
  describeAltitudeStories,
  describeNoiseLevel,
  estimateIndoorDb,
  formatPlainWindLabel,
  getHumanVerdict,
} from "@/lib/humanCopy";
import type { AuditRecord } from "@/lib/types";

interface InspectionSlipCardProps {
  audit: AuditRecord;
}

export function InspectionSlipCard({ audit }: InspectionSlipCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [negotiationOpen, setNegotiationOpen] = useState(false);
  const { analysis } = audit;
  const verdict = getHumanVerdict(analysis.verdict, analysis.insideCone, {
    nightFlights: analysis.nightFlights,
    totalDailyMovements: analysis.totalDailyMovements,
  });
  const plainSummary = buildPlainSummary(analysis);
  const noiseAnalogy = describeNoiseLevel(analysis.estimatedDb);
  const indoorDb = estimateIndoorDb(analysis.estimatedDb);
  const storiesAnalogy = describeAltitudeStories(
    analysis.altitudeFeet,
    analysis.corridorType
  );
  const windLabel = formatPlainWindLabel(analysis.prevailingWindLabel);
  const lateralKm = computeLateralDistanceKm(
    analysis.distanceKm,
    analysis.angleOffsetDeg
  );

  const alignmentHeadline =
    analysis.noNearbyAirport
      ? "Outside Airport Range"
      : analysis.corridorType === "OFF_AXIS"
        ? `Off-axis from Runway ${analysis.runwayName}`
        : `Runway ${analysis.runwayName} ${
            analysis.corridorType === "APPROACH" ? "Landing" : "Takeoff"
          } Path`;

  const alignmentDetail = analysis.noNearbyAirport
    ? "No commercial airport within 25 km radius"
    : analysis.insideCone
      ? `Directly inside flight corridor (${analysis.angleOffsetDeg.toFixed(1)}° off center)`
      : `${analysis.angleOffsetDeg.toFixed(1)}° to the side (~${lateralKm.toFixed(1)} km lateral clearance)`;

  function handlePostOnX() {
    const shareUrl = `${window.location.origin}/audit/${audit.id}`;
    const isLightTraffic =
      analysis.insideCone &&
      analysis.nightFlights < 2 &&
      analysis.totalDailyMovements < 15;

    const tweetText =
      analysis.verdict === "CLEAR_AIRSPACE"
        ? `Checked this stay on OverMyRoof before booking. Verified aviation data confirms quiet skies outside ${analysis.airportIata} flight corridors:`
        : !analysis.insideCone
          ? `Checked this stay on OverMyRoof before booking. It sits ${analysis.distanceKm.toFixed(1)} km from ${analysis.airportIata}, ~${lateralKm.toFixed(1)} km to the side of the main Runway ${analysis.runwayName} path:`
          : isLightTraffic
            ? `Checked this stay on OverMyRoof before booking. It lines up with ${analysis.airportIata} Runway ${analysis.runwayName} (~${analysis.altitudeFeet.toLocaleString()} ft overhead), though scheduled commercial traffic is currently light:`
            : `Checked this place on OverMyRoof before booking. Aviation & wind data shows jets flying ~${analysis.altitudeFeet.toLocaleString()} ft overhead (${analysis.nightFlights} airport-wide overnight flights, active ${analysis.activeWindPct}% of the year):`;

    const intentUrl = `https://x.com/intent/post?text=${encodeURIComponent(
      tweetText
    )}&url=${encodeURIComponent(shareUrl)}`;

    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "x_share_click",
        auditId: audit.id,
        meta: { verdict: analysis.verdict, airport: analysis.airportIata },
      }),
    }).catch(() => {});

    window.open(intentUrl, "_blank", "noopener,noreferrer");
  }

  async function handleCopyLink() {
    try {
      const shareUrl = `${window.location.origin}/audit/${audit.id}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  }

  async function handleDownloadPng() {
    setDownloading(true);
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "png_download",
        auditId: audit.id,
      }),
    }).catch(() => {});
    try {
      await downloadAuditReportPng(audit);
    } catch {
      window.open(
        `/api/og/${encodeURIComponent(audit.id)}`,
        "_blank",
        "noopener,noreferrer"
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <article className="overflow-hidden rounded-3xl border border-[#E7E5E4] bg-white shadow-sm">
        {/* Top Color-Coded Verdict Banner */}
        <div
          className={`border-b px-6 py-5 sm:px-8 sm:py-6 ${verdict.bgClass} ${verdict.borderClass}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-bold ${verdict.badgeBgClass} ${verdict.badgeTextClass}`}
            >
              <span className={`h-2 w-2 rounded-full ${verdict.dotClass}`} />
              {verdict.badgeLabel} · {verdict.sleepImpact}
            </span>

            <span className="font-data text-xs font-medium text-[#52525B]">
              Report #{audit.id} · {audit.createdAt.slice(0, 10)}
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-[#18181B] sm:text-3xl">
            {verdict.title}
          </h1>
          <p className="mt-1.5 text-sm font-medium text-[#3F3F46] sm:text-base">
            {audit.formattedAddress}
          </p>
        </div>

        {/* Main Report Content */}
        <div className="space-y-6 p-6 sm:p-8">
          {/* Plain-English Summary */}
          <div className="rounded-2xl border border-[#E7E5E4] bg-[#FAF9F7] px-5 py-4">
            <div className="text-xs font-bold uppercase tracking-wider text-[#71717A]">
              What this means for your stay
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-[#18181B] sm:text-[15px]">
              {plainSummary}
            </p>
          </div>

          {/* Interactive Real Street Map + Side-View Height/Clearance */}
          <FlightPathMap audit={audit} />

          {/* 6 Clear Human-Readable Stat Cards */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-[#E7E5E4] bg-white p-4">
              <div className="text-xs font-medium text-[#71717A]">
                Peak Flyover Noise
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  style={{ color: verdict.accentHex }}
                  className="text-2xl font-extrabold tracking-tight"
                >
                  ~{analysis.estimatedDb} dB
                </span>
                <span className="text-xs font-semibold text-[#52525B]">
                  (~{indoorDb} dB indoors)
                </span>
              </div>
              <p className="mt-1 text-xs text-[#52525B]">{noiseAnalogy}</p>
            </div>

            <div className="rounded-2xl border border-[#E7E5E4] bg-white p-4">
              <div className="text-xs font-medium text-[#71717A]">
                Airport Night Flights (11 PM–6 AM)
              </div>
              <div className="mt-1 text-2xl font-extrabold tracking-tight text-[#18181B]">
                {analysis.noNearbyAirport
                  ? "None nearby"
                  : `${analysis.nightFlights} flights`}
              </div>
              <p className="mt-1 text-xs text-[#52525B]">
                {analysis.noNearbyAirport
                  ? "No commercial airport within 25 km"
                  : `Airport-wide scheduled (${analysis.totalDailyMovements} across 12h window)`}
              </p>
            </div>

            <div className="rounded-2xl border border-[#E7E5E4] bg-white p-4">
              <div className="text-xs font-medium text-[#71717A]">
                {analysis.insideCone ? "Plane Height Overhead" : "Position vs. Flight Path"}
              </div>
              {analysis.insideCone ? (
                <>
                  <div className="mt-1 text-2xl font-extrabold tracking-tight text-[#18181B]">
                    ~{analysis.altitudeFeet.toLocaleString()} ft
                    <span className="ml-1.5 text-sm font-medium text-[#71717A]">
                      ({analysis.altitudeMeters} m)
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#52525B]">{storiesAnalogy}</p>
                </>
              ) : (
                <>
                  <div className="mt-1 text-xl font-extrabold tracking-tight text-[#18181B]">
                    Off direct path
                  </div>
                  <p className="mt-1 text-xs text-[#52525B]">
                    Jets pass ~{lateralKm.toFixed(1)} km to the side (not directly over roof)
                  </p>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-[#E7E5E4] bg-white p-4">
              <div className="text-xs font-medium text-[#71717A]">
                Nearest Airport
              </div>
              <div className="mt-1 text-lg font-bold text-[#18181B]">
                {analysis.airportIata} · {analysis.distanceKm.toFixed(1)} km away
              </div>
              <p className="mt-1 text-xs text-[#52525B]">
                {analysis.airportName}
              </p>
            </div>

            <div className="rounded-2xl border border-[#E7E5E4] bg-white p-4">
              <div className="text-xs font-medium text-[#71717A]">
                How Often Wind Routes Planes Here
              </div>
              <div className="mt-1 text-lg font-bold text-[#18181B]">
                {analysis.noNearbyAirport
                  ? "Not exposed"
                  : `${analysis.activeWindPct}% of the year`}
              </div>
              <p className="mt-1 text-xs text-[#52525B]">
                {analysis.noNearbyAirport
                  ? "Outside 25 km commercial runway range"
                  : `Mostly ${windLabel} (avg ${analysis.meanWindSpeedKmh} km/h)`}
              </p>
            </div>

            <div className="rounded-2xl border border-[#E7E5E4] bg-white p-4">
              <div className="text-xs font-medium text-[#71717A]">
                Runway Alignment
              </div>
              <div className="mt-1 text-lg font-bold text-[#18181B]">
                {alignmentHeadline}
              </div>
              <p className="mt-1 text-xs text-[#52525B]">{alignmentDetail}</p>
            </div>
          </div>

          {/* Verified Proof Strip + Action Buttons */}
          <div className="flex flex-col gap-4 border-t border-[#E7E5E4] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  audit.mode === "LIVE"
                    ? "bg-[#DCFCE7] text-[#15803D]"
                    : "bg-[#FEF3C7] text-[#B45309]"
                }`}
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <div>
                <div className="text-xs font-bold text-[#18181B]">
                  {audit.mode === "LIVE"
                    ? "Cryptographically Signed via API3 AirnodeHub"
                    : "Sample Preview Report (AirnodeHub Schema)"}
                </div>
                <div className="font-data text-[11px] text-[#71717A]">
                  {audit.mode === "LIVE"
                    ? `${audit.attestations.length} live signed sources · Proof ${audit.combinedProofHash.slice(0, 12)}...`
                    : "Search any address on the home page for live EIP-191 signed proof"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setNegotiationOpen(true)}
                className="cursor-pointer rounded-xl bg-[#0F172A] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#1E293B]"
              >
                Message Host / Landlord
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPng()}
                disabled={downloading}
                className="cursor-pointer rounded-xl border border-[#D4D4D8] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#18181B] transition-colors hover:border-[#0F172A] disabled:opacity-60"
              >
                {downloading ? "Saving PNG..." : "Download PNG"}
              </button>
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="cursor-pointer rounded-xl border border-[#D4D4D8] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#18181B] transition-colors hover:border-[#0F172A]"
              >
                {copiedLink ? "Link Copied ✓" : "Copy Link"}
              </button>
              <button
                type="button"
                onClick={handlePostOnX}
                className="cursor-pointer rounded-xl border border-[#D4D4D8] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#18181B] transition-colors hover:border-[#0F172A]"
              >
                Share on X ↗
              </button>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-[#71717A]">
            {OVERHEAD_DISCLAIMER}
          </p>
        </div>
      </article>

      <NegotiationModal
        audit={audit}
        open={negotiationOpen}
        onClose={() => setNegotiationOpen(false)}
      />
    </div>
  );
}
