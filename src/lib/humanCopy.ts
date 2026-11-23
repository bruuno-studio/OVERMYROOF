import type { CorridorAnalysis, VerdictTier } from "@/lib/types";

export interface HumanVerdictStyle {
  badgeLabel: string;
  title: string;
  subtitle: string;
  sleepImpact: string;
  accentHex: string;
  bgClass: string;
  borderClass: string;
  badgeBgClass: string;
  badgeTextClass: string;
  dotClass: string;
}

export interface VerdictContext {
  nightFlights?: number;
  totalDailyMovements?: number;
}

/** Perpendicular lateral distance (km) from the extended runway centerline. */
export function computeLateralDistanceKm(
  distanceKm: number,
  angleOffsetDeg: number
): number {
  const rad = (Math.min(angleOffsetDeg, 90) * Math.PI) / 180;
  return Math.round(distanceKm * Math.sin(rad) * 10) / 10;
}

/** Typical closed double-glazed bedroom window reduces outdoor aircraft peak by ~22 dB. */
export function estimateIndoorDb(outdoorDb: number): number {
  return Math.max(28, outdoorDb - 22);
}

/** Plain-English indoor perception with standard double-glazed windows closed. */
export function describeIndoorNoise(indoorDb: number): string {
  if (indoorDb >= 60) return "Clearly audible indoors even with windows closed";
  if (indoorDb >= 52) return "Noticeable low rumble indoors; lighter sleepers may wake";
  if (indoorDb >= 44) return "Muffled background hum with double-glazed windows closed";
  return "Very quiet indoors with windows closed";
}

export function getHumanVerdict(
  verdict: VerdictTier,
  insideCone = true,
  context?: VerdictContext
): HumanVerdictStyle {
  const isLightTrafficCorridor =
    verdict === "ACTIVE_APPROACH_CONE" &&
    insideCone &&
    context?.nightFlights !== undefined &&
    context.nightFlights < 2 &&
    context?.totalDailyMovements !== undefined &&
    context.totalDailyMovements < 15;

  switch (verdict) {
    case "LOW_FLYOVER_CORRIDOR":
      return {
        badgeLabel: "Loud Flight Path",
        title: "Heavy Jet Flyovers Overhead",
        subtitle:
          "This stay sits directly under a busy low-altitude airport corridor. Expect frequent, loud airplane noise—especially outdoors or with windows open.",
        sleepImpact: "High sleep disruption risk",
        accentHex: "#DC2626",
        bgClass: "bg-[#FEF2F2]",
        borderClass: "border-[#FECACA]",
        badgeBgClass: "bg-[#FEE2E2]",
        badgeTextClass: "text-[#B91C1C]",
        dotClass: "bg-[#DC2626]",
      };
    case "ACTIVE_APPROACH_CONE":
      if (isLightTrafficCorridor) {
        return {
          badgeLabel: "Light-Traffic Corridor",
          title: "Under Runway Path (Light Traffic)",
          subtitle:
            "This address lines up with the runway corridor, so individual planes pass low when scheduled—but airport flight volume is currently very light.",
          sleepImpact: "Occasional flyovers only",
          accentHex: "#D97706",
          bgClass: "bg-[#FFFBEB]",
          borderClass: "border-[#FDE68A]",
          badgeBgClass: "bg-[#FEF3C7]",
          badgeTextClass: "text-[#B45309]",
          dotClass: "bg-[#D97706]",
        };
      }
      return {
        badgeLabel: insideCone ? "Moderate Flyovers" : "Near Airport",
        title: insideCone
          ? "Active Flight Path Overhead"
          : "Near Airport (Off Direct Flight Path)",
        subtitle: insideCone
          ? "Planes pass overhead along this runway corridor when wind patterns use this direction. Noticeable outdoors and through thin windows."
          : "This address is within 5 km of the airport, but sits to the side of the main landing and takeoff path rather than directly underneath it.",
        sleepImpact: "Ask about soundproof windows",
        accentHex: "#D97706",
        bgClass: "bg-[#FFFBEB]",
        borderClass: "border-[#FDE68A]",
        badgeBgClass: "bg-[#FEF3C7]",
        badgeTextClass: "text-[#B45309]",
        dotClass: "bg-[#D97706]",
      };
    case "CLEAR_AIRSPACE":
      return {
        badgeLabel: "Quiet Skies",
        title: "Clear Airspace Overhead",
        subtitle:
          "This address sits outside direct airport landing and takeoff corridors. Commercial plane noise should be minimal.",
        sleepImpact: "Low airplane noise impact",
        accentHex: "#16A34A",
        bgClass: "bg-[#F0FDF4]",
        borderClass: "border-[#BBF7D0]",
        badgeBgClass: "bg-[#DCFCE7]",
        badgeTextClass: "text-[#15803D]",
        dotClass: "bg-[#16A34A]",
      };
  }
}

/** Relatable everyday noise comparison for travelers and renters. */
export function describeNoiseLevel(db: number): string {
  if (db >= 82) return "Loud as a blender or subway train outdoors";
  if (db >= 74) return "Like standing next to a busy highway";
  if (db >= 66) return "Like a vacuum cleaner or loud street traffic";
  if (db >= 58) return "Like normal outdoor conversation";
  return "Quiet residential background outdoors";
}

/** Plain-English wind label ("WESTERLY WINDS" -> "westerly winds"). */
export function formatPlainWindLabel(label: string): string {
  return label.toLowerCase();
}

/** Convert altitude in feet into an intuitive building-story analogy. */
export function describeAltitudeStories(
  altitudeFeet: number,
  corridorType?: CorridorAnalysis["corridorType"]
): string {
  const stories = Math.max(10, Math.round(altitudeFeet / 11));
  const phase = corridorType === "DEPARTURE" ? "climbout" : "descent";
  if (altitudeFeet < 900) {
    return `Very low ${phase} — roughly ${stories} stories above the roof`;
  }
  if (altitudeFeet < 2200) {
    return `Low ${phase} — roughly ${stories} stories up`;
  }
  return `High overhead — roughly ${stories} stories up`;
}

/** Single-sentence executive summary any hotel or Airbnb guest immediately grasps. */
export function buildPlainSummary(analysis: CorridorAnalysis): string {
  const windPhrase = formatPlainWindLabel(analysis.prevailingWindLabel);
  const lateralKm = computeLateralDistanceKm(
    analysis.distanceKm,
    analysis.angleOffsetDeg
  );

  if (analysis.noNearbyAirport) {
    return `Great news for light sleepers: no commercial airports sit within 25 km of this address (nearest major hub is ${analysis.airportName}, ${analysis.distanceKm.toFixed(1)} km away). Overhead commercial plane noise should not be an issue.`;
  }

  if (analysis.verdict === "CLEAR_AIRSPACE") {
    return `Good news for light sleepers: this address is ${analysis.distanceKm.toFixed(1)} km from ${analysis.airportName} (${analysis.airportIata}) and outside direct landing or takeoff cones (~${lateralKm.toFixed(1)} km off the main path), so jets stay high or far to the side.`;
  }

  if (!analysis.insideCone) {
    return `This stay is ${analysis.distanceKm.toFixed(1)} km from ${analysis.airportName} (${analysis.airportIata}), but sits ${analysis.angleOffsetDeg.toFixed(1)}° to the side of Runway ${analysis.runwayName} (~${lateralKm.toFixed(1)} km off the centerline). Planes do not fly directly over the roof, though distant airport noise may be audible during ${windPhrase}.`;
  }

  const opWord =
    analysis.corridorType === "DEPARTURE"
      ? "taking off from"
      : "landing at";

  if (analysis.nightFlights < 2 && analysis.totalDailyMovements < 15) {
    return `This address aligns with ${analysis.airportName} (${analysis.airportIata}) Runway ${analysis.runwayName}, where planes ${opWord} this end pass around ${analysis.altitudeFeet.toLocaleString()} ft overhead—however, airport-wide scheduled traffic is currently light (${analysis.nightFlights} overnight flights between 11 PM and 6 AM, ${analysis.totalDailyMovements} in the 12-hour schedule window).`;
  }

  return `Planes ${opWord} ${analysis.airportName} (${analysis.airportIata}) Runway ${analysis.runwayName} pass directly over this corridor at roughly ${analysis.altitudeFeet.toLocaleString()} ft above the roof about ${analysis.activeWindPct}% of the year during ${windPhrase}. The airport has ${analysis.nightFlights} scheduled airport-wide movements between 11 PM and 6 AM.`;
}
