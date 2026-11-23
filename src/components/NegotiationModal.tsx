"use client";

import { useState } from "react";
import { computeLateralDistanceKm, formatPlainWindLabel } from "@/lib/humanCopy";
import type { AuditRecord } from "@/lib/types";

interface NegotiationModalProps {
  audit: AuditRecord;
  open: boolean;
  onClose: () => void;
}

type NoteTone = "host" | "rent" | "glazing";

export function NegotiationModal({
  audit,
  open,
  onClose,
}: NegotiationModalProps) {
  const [tone, setTone] = useState<NoteTone>("host");
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const { analysis } = audit;
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://overmyroof.app";
  const auditUrl = `${origin}/audit/${audit.id}`;
  const windPhrase = formatPlainWindLabel(analysis.prevailingWindLabel);
  const lateralKm = computeLateralDistanceKm(
    analysis.distanceKm,
    analysis.angleOffsetDeg
  );

  const isClear = analysis.verdict === "CLEAR_AIRSPACE";
  const isOffAxis = !analysis.insideCone;
  const isLightTraffic =
    analysis.insideCone &&
    analysis.nightFlights < 2 &&
    analysis.totalDailyMovements < 15;

  const hostNote = isClear
    ? `Hi there,

I'm really interested in booking ${audit.formattedAddress} and had one quick question before confirming.

I ran a quick airspace check (${auditUrl}) which confirmed the area sits outside direct ${analysis.airportIata} flight corridors—could you also confirm whether the bedrooms are generally quiet at night (street noise / window glazing)?

Thanks so much!`
    : isOffAxis
      ? `Hi there,

I'm really interested in booking ${audit.formattedAddress} and had one quick question before confirming.

I noticed the area is ${analysis.distanceKm.toFixed(1)} km from ${analysis.airportIata} (${analysis.airportName}), sitting roughly ${lateralKm.toFixed(1)} km to the side of the main Runway ${analysis.runwayName} flight path (${auditUrl}).

Do the bedrooms have double-glazed windows, and is distant airport sound ever noticeable at night?

Thanks so much!`
      : isLightTraffic
        ? `Hi there,

I'm really excited about booking ${audit.formattedAddress} and had one quick question before confirming.

I checked the flight-path map (${auditUrl}) and noticed the address lines up with ${analysis.airportIata} Runway ${analysis.runwayName} (~${analysis.altitudeFeet.toLocaleString()} ft overhead when active), though scheduled traffic looks light (${analysis.nightFlights} scheduled overnight flights).

Do the bedrooms have double-glazed windows, and are occasional flyovers noticeable indoors?

Thanks so much!`
        : `Hi there,

I'm really excited about booking ${audit.formattedAddress} and had one quick question before confirming.

I noticed the area is ${analysis.distanceKm.toFixed(1)} km from ${analysis.airportIata} (${analysis.airportName}), under Runway ${analysis.runwayName} where planes pass roughly ${analysis.altitudeFeet.toLocaleString()} ft overhead (${analysis.nightFlights} airport-wide flights scheduled between 11 PM and 6 AM). Here's the flight-path report I checked: ${auditUrl}

Do the bedrooms have double-glazed or soundproofed windows, and is airplane noise noticeable at night? (If this is a hotel, could I request a quiet room away from the flight path?)

Thanks so much!`;

  const rentNote = isClear
    ? `Hello,

I'm interested in moving forward with ${audit.formattedAddress}. I checked the overhead flight-path report (${auditUrl}), which confirmed the property sits outside direct ${analysis.airportIata} flight paths.

Before finalizing the lease, could you confirm the bedroom window glazing and general nighttime quietness around the building?

Thank you.`
    : isOffAxis
      ? `Hello,

Before signing the lease for ${audit.formattedAddress}, I checked the property's proximity to ${analysis.airportIata} (${auditUrl}). While it sits ~${lateralKm.toFixed(1)} km off the main Runway ${analysis.runwayName} centerline, it is still ${analysis.distanceKm.toFixed(1)} km from the airport.

Could you confirm what acoustic or double glazing is installed in the bedrooms, and whether distant airport activity is audible during ${windPhrase}?

Thank you.`
      : isLightTraffic
        ? `Hello,

Before signing the lease for ${audit.formattedAddress}, I checked the overhead flight-path report (${auditUrl}). The property aligns with ${analysis.airportIata} Runway ${analysis.runwayName} (~${analysis.altitudeFeet.toLocaleString()} ft overhead, ~${analysis.estimatedDb} dB outdoors when a plane passes), though current scheduled flight volume is light.

Could you confirm what type of window glazing is installed in the bedrooms in case seasonal or charter flights increase?

Thank you.`
        : `Hello,

Before signing the lease for ${audit.formattedAddress}, I checked the property's overhead flight-path exposure using aviation and wind data (${auditUrl}).

The report shows the address sits ${analysis.distanceKm.toFixed(1)} km from ${analysis.airportIata} along Runway ${analysis.runwayName}, where planes pass around ${analysis.altitudeFeet.toLocaleString()} ft overhead (~${analysis.estimatedDb} dB outdoors) roughly ${analysis.activeWindPct}% of the year under ${windPhrase}, with ${analysis.nightFlights} airport-wide scheduled overnight flights (11 PM to 6 AM).

Given the documented flight-corridor exposure, could we discuss either a modest rent adjustment or confirm what acoustic glazing is installed in the bedrooms?

Thank you.`;

  const glazingNote = isClear
    ? `Hello,

I'm very interested in ${audit.formattedAddress}. I checked overhead airspace (${auditUrl}) and it sits outside direct airport corridors—could you share what type of window glazing (double or acoustic glass) is installed in the sleeping areas so I know what to expect for general nighttime quietness?

Best regards.`
    : isOffAxis
      ? `Hello,

I'm very interested in ${audit.formattedAddress}. I checked the flight-path map (${auditUrl}) which shows the address is ${analysis.distanceKm.toFixed(1)} km from ${analysis.airportIata} (about ${lateralKm.toFixed(1)} km to the side of Runway ${analysis.runwayName}).

Could you share what type of window glazing is installed in the bedrooms and how quiet the rooms are with windows closed?

Best regards.`
      : `Hello,

I'm very interested in ${audit.formattedAddress}. As part of my check before moving forward, I ran an overhead airspace report (${auditUrl}) which shows ${analysis.airportIata} Runway ${analysis.runwayName} traffic passes roughly ${analysis.altitudeFeet.toLocaleString()} ft overhead (${analysis.nightFlights} airport-wide flights scheduled between 11 PM and 6 AM).

Could you share what type of window glazing (double or acoustic laminated glass) is installed in the sleeping areas, and how quiet the rooms are with windows closed?

Best regards.`;

  const activeText =
    tone === "host" ? hostNote : tone === "rent" ? rentNote : glazingNote;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(activeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      void fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "negotiation_copy",
          auditId: audit.id,
          meta: { tone },
        }),
      }).catch(() => {});
    } catch {
      // Clipboard unavailable
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Message Host or Landlord"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-[#E7E5E4] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#E7E5E4] bg-[#FAF9F7] px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-[#18181B]">
              Ready-to-send message for your host or landlord
            </h3>
            <p className="mt-0.5 text-xs text-[#52525B]">
              Polite, factual message referencing this verified flight-path report.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full border border-[#E7E5E4] bg-white px-3 py-1 text-xs font-semibold text-[#52525B] hover:border-[#0F172A] hover:text-[#0F172A]"
          >
            Close
          </button>
        </div>

        <div className="p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTone("host")}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                tone === "host"
                  ? "bg-[#0F172A] text-white"
                  : "border border-[#E7E5E4] bg-white text-[#52525B] hover:border-[#0F172A]"
              }`}
            >
              Ask Airbnb / Hotel Host
            </button>
            <button
              type="button"
              onClick={() => setTone("rent")}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                tone === "rent"
                  ? "bg-[#0F172A] text-white"
                  : "border border-[#E7E5E4] bg-white text-[#52525B] hover:border-[#0F172A]"
              }`}
            >
              Negotiate Apartment Rent
            </button>
            <button
              type="button"
              onClick={() => setTone("glazing")}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                tone === "glazing"
                  ? "bg-[#0F172A] text-white"
                  : "border border-[#E7E5E4] bg-white text-[#52525B] hover:border-[#0F172A]"
              }`}
            >
              Check Window Soundproofing
            </button>
          </div>

          <textarea
            readOnly
            value={activeText}
            rows={11}
            className="w-full resize-none rounded-2xl border border-[#E7E5E4] bg-[#FAF9F7] p-4 text-sm leading-relaxed text-[#18181B] focus:outline-none"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[#71717A]">
              Includes link to this verified report
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-xl border border-[#D4D4D8] bg-white px-4 py-2 text-xs font-semibold text-[#52525B] hover:text-[#18181B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="cursor-pointer rounded-xl bg-[#0F172A] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1E293B]"
              >
                {copied ? "Copied to clipboard ✓" : "Copy Message"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
