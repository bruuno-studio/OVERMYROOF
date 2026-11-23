import { findFallbackAirport, type AirportRunwayEntry } from "@/lib/runways";
import type {
  AeroDataBoxAirportItem,
  AeroDataBoxRunwayItem,
  AeroDataBoxScheduleResponse,
  CorridorAnalysis,
  CorridorOperationType,
  OpenMeteoHistoricalResponse,
  VerdictTier,
} from "@/lib/types";

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const ILS_GLIDESLOPE_DEG = 3;
const DEPARTURE_CLIMB_DEG = 6.2;
const METERS_TO_FEET = 3.28084;

export const OVERHEAD_DISCLAIMER =
  "Estimates cover overhead commercial aviation only (derived from standard 3° landing / ~6° climb geometry, wind history, and airport schedules) and do not measure street-level noise.";

/** Great-circle Haversine distance in kilometers. */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEG_TO_RAD) *
      Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** Initial compass bearing (0..360 true) from point 1 (airport) to point 2 (address). */
export function compassBearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const dLambda = (lon2 - lon1) * DEG_TO_RAD;

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

  return ((Math.atan2(y, x) * RAD_TO_DEG) + 360) % 360;
}

/** Smallest circular angular difference in degrees (0..180). */
export function angularDifferenceDeg(a: number, b: number): number {
  const diff = Math.abs(((a % 360) + 360) % 360 - (((b % 360) + 360) % 360));
  return diff > 180 ? 360 - diff : diff;
}

/** Standard 3° ILS landing glideslope or ~6.2° commercial jet departure climb altitude above ground level. */
export function estimateGlideslopeAltitude(
  distanceKm: number,
  corridorType: CorridorOperationType = "APPROACH"
): {
  altitudeMeters: number;
  altitudeFeet: number;
} {
  if (corridorType === "DEPARTURE") {
    // Jets roll ~0.8 km past airport reference center before climbing at ~6.2° average commercial gradient
    const climbDistKm = Math.max(0.45, distanceKm - 0.8);
    const altitudeMeters = Math.round(
      climbDistKm * 1000 * Math.tan(DEPARTURE_CLIMB_DEG * DEG_TO_RAD)
    );
    const altitudeFeet = Math.round(altitudeMeters * METERS_TO_FEET);
    return { altitudeMeters, altitudeFeet };
  }
  const altitudeMeters = Math.round(
    distanceKm * 1000 * Math.tan(ILS_GLIDESLOPE_DEG * DEG_TO_RAD)
  );
  const altitudeFeet = Math.round(altitudeMeters * METERS_TO_FEET);
  return { altitudeMeters, altitudeFeet };
}

/** Convert compass meteorological direction (wind FROM degrees) to aviation label. */
export function formatWindDirectionLabel(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const sectors = [
    "NORTHERLY WINDS",
    "NORTHEASTERLY WINDS",
    "EASTERLY WINDS",
    "SOUTHEASTERLY WINDS",
    "SOUTHERLY WINDS",
    "SOUTHWESTERLY WINDS",
    "WESTERLY WINDS",
    "NORTHWESTERLY WINDS",
  ];
  const idx = Math.round(normalized / 45) % 8;
  return sectors[idx];
}

/** Circular mean of compass bearings in degrees (0..360). */
export function circularMeanDeg(samples: number[]): number {
  if (samples.length === 0) return 270;
  let sinSum = 0;
  let cosSum = 0;
  for (const deg of samples) {
    sinSum += Math.sin(deg * DEG_TO_RAD);
    cosSum += Math.cos(deg * DEG_TO_RAD);
  }
  return ((Math.atan2(sinSum, cosSum) * RAD_TO_DEG) + 360) % 360;
}

/**
 * Percentage of wind samples blowing within ±60 degrees of targetRunwayHdg.
 * Aircraft land and take off INTO the wind, so a runway heading `trueHdg`
 * is active when meteorological wind blows FROM `trueHdg ± 60°`.
 */
export function calculateWindExposurePct(
  windDirectionsDeg: number[],
  targetRunwayHdg: number
): number {
  const valid = windDirectionsDeg.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return 50;
  const activeCount = valid.filter(
    (dir) => angularDifferenceDeg(dir, targetRunwayHdg) <= 60
  ).length;
  return Math.round((activeCount / valid.length) * 100);
}

/** Extract wind direction and speed arrays from Open-Meteo historicalWeather response. */
export function extractWindSamples(weather: OpenMeteoHistoricalResponse): {
  directions: number[];
  meanSpeedKmh: number;
} {
  const directions =
    weather.daily?.wind_direction_10m_dominant ??
    weather.hourly?.wind_direction_10m ??
    [];
  const speeds =
    weather.daily?.wind_speed_10m_max ??
    weather.hourly?.wind_speed_10m ??
    [];
  const validSpeeds = speeds.filter((v) => Number.isFinite(v));
  const meanSpeedKmh =
    validSpeeds.length > 0
      ? Math.round(
          (validSpeeds.reduce((sum, v) => sum + v, 0) / validSpeeds.length) * 10
        ) / 10
      : 18;
  return {
    directions: directions.filter((v) => Number.isFinite(v)),
    meanSpeedKmh,
  };
}

/** Extract local hour (0..23) from an AeroDataBox local timestamp string (e.g., "2026-11-23 23:45+00:00"). */
function parseLocalHour(localTimestamp?: string): number | null {
  if (!localTimestamp) return null;
  const match = localTimestamp.match(/[T\s](\d{2}):(\d{2})/);
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  return Number.isNaN(hour) ? null : hour;
}

/** Count scheduled airport movements falling in the local 23:00 to 06:00 night window. */
export function countNightMovements(schedule: AeroDataBoxScheduleResponse): {
  nightFlights: number;
  totalDailyMovements: number;
} {
  const all = [
    ...(schedule.arrivals ?? []),
    ...(schedule.departures ?? []),
  ];
  let nightFlights = 0;
  for (const flight of all) {
    const localTime =
      flight.movement.revisedTime?.local ??
      flight.movement.scheduledTime?.local;
    const hour = parseLocalHour(localTime);
    if (hour !== null && (hour >= 23 || hour < 6)) {
      nightFlights += 1;
    }
  }
  return {
    nightFlights,
    totalDailyMovements: all.length,
  };
}

/**
 * Deterministic peak outdoor flyover noise estimate (dB A-weighted peak).
 * Calibrated so 2 km centerline ≈ 85 dB, 4.1 km ≈ 79 dB, tapering down to ~55 dB at 15 km or outside cone.
 */
export function estimatePeakOutdoorDb(params: {
  distanceKm: number;
  angleOffsetDeg: number;
  altitudeMeters: number;
  insideCone: boolean;
  corridorType?: CorridorOperationType;
}): number {
  const {
    distanceKm,
    angleOffsetDeg,
    altitudeMeters,
    insideCone,
    corridorType = "APPROACH",
  } = params;

  if (insideCone) {
    const safeDist = Math.max(distanceKm, 1.4);
    const distanceAttenuation = 19.5 * Math.log10(safeDist / 2.0);
    const lateralAttenuation = angleOffsetDeg * 0.42;
    const altitudePenalty = Math.max(0, (altitudeMeters - 380) / 260) * 1.6;
    // Takeoffs use climb thrust (TOGA/Flex), noticeably louder than idle-thrust approaches at equal distance
    const departureThrustBoost = corridorType === "DEPARTURE" ? 3 : 0;
    const db = Math.round(
      85 -
        distanceAttenuation -
        lateralAttenuation -
        altitudePenalty +
        departureThrustBoost
    );
    return Math.max(55, Math.min(88, db));
  }

  // Outside approach/departure cone: sharper lateral attenuation
  const safeDist = Math.max(distanceKm, 1.8);
  const lateralCap = Math.min(angleOffsetDeg, 55);
  const db = Math.round(
    76 - 17 * Math.log10(safeDist / 1.8) - lateralCap * 0.25
  );
  if (distanceKm > 16) {
    return Math.max(44, Math.min(54, db));
  }
  return Math.max(48, Math.min(71, db));
}

function deriveReciprocalName(name: string): string {
  const match = name.match(/^(\d{1,2})([LCR]?)$/i);
  if (!match) return `${name}-RECIP`;
  const num = Number.parseInt(match[1], 10);
  const recipNum = ((num + 17) % 36) + 1;
  const suffix = match[2].toUpperCase();
  const recipSuffix = suffix === "L" ? "R" : suffix === "R" ? "L" : suffix;
  return `${String(recipNum).padStart(2, "0")}${recipSuffix}`;
}

interface CandidateRunway {
  name: string;
  trueHdg: number;
}

function normalizeRunwayCandidates(
  liveRunways: AeroDataBoxRunwayItem[] | undefined,
  airportCode: string
): { candidates: CandidateRunway[]; source: "AERODATABOX" | "FALLBACK_TABLE" } {
  const activeLive = (liveRunways ?? []).filter(
    (r) => !r.isClosed && typeof r.trueHdg === "number" && Number.isFinite(r.trueHdg)
  );

  if (activeLive.length > 0) {
    const byName = new Map<string, CandidateRunway>();
    for (const r of activeLive) {
      byName.set(r.name, { name: r.name, trueHdg: ((r.trueHdg % 360) + 360) % 360 });
      const recipName = deriveReciprocalName(r.name);
      if (!byName.has(recipName)) {
        byName.set(recipName, {
          name: recipName,
          trueHdg: (r.trueHdg + 180) % 360,
        });
      }
    }
    return { candidates: Array.from(byName.values()), source: "AERODATABOX" };
  }

  const fallback = findFallbackAirport(airportCode);
  if (fallback && fallback.runways.length > 0) {
    return {
      candidates: fallback.runways.map((r: AirportRunwayEntry) => ({
        name: r.name,
        trueHdg: r.trueHdg,
      })),
      source: "FALLBACK_TABLE",
    };
  }

  // Generic east-west fallback if completely unknown regional field
  return {
    candidates: [
      { name: "27", trueHdg: 270 },
      { name: "09", trueHdg: 90 },
    ],
    source: "FALLBACK_TABLE",
  };
}

export function classifyVerdict(params: {
  insideCone: boolean;
  distanceKm: number;
  nightFlights: number;
  totalDailyMovements?: number;
  estimatedDb: number;
}): {
  verdict: VerdictTier;
  verdictHeadline: string;
  verdictSubline: string;
} {
  const {
    insideCone,
    distanceKm,
    nightFlights,
    totalDailyMovements = 20,
    estimatedDb,
  } = params;

  // Require real commercial flight volume before triggering a heavy-traffic red alert
  const hasSignificantTraffic =
    nightFlights >= 8 ||
    (estimatedDb >= 72 && (nightFlights >= 2 || totalDailyMovements >= 15));

  if (insideCone && distanceKm <= 8 && hasSignificantTraffic) {
    return {
      verdict: "LOW_FLYOVER_CORRIDOR",
      verdictHeadline: "LOW FLYOVER CORRIDOR · HEAVY OVERHEAD TRAFFIC",
      verdictSubline: "Direct low-altitude corridor exposure inside 8 km threshold",
    };
  }

  if ((insideCone && distanceKm <= 16) || distanceKm <= 5) {
    const lightRegional = insideCone && nightFlights < 2 && totalDailyMovements < 15;
    return {
      verdict: "ACTIVE_APPROACH_CONE",
      verdictHeadline: lightRegional
        ? "RUNWAY CORRIDOR · LIGHT SCHEDULED TRAFFIC"
        : "ACTIVE APPROACH CONE · MODERATE FLYOVERS",
      verdictSubline: lightRegional
        ? "Directly aligned with runway path, but scheduled commercial traffic is currently light"
        : insideCone
          ? "Aligned with extended runway centerline inside 16 km cone"
          : "Near-field off-axis perimeter within 5 km of airport reference",
    };
  }

  return {
    verdict: "CLEAR_AIRSPACE",
    verdictHeadline: "OUTSIDE FLIGHT CORRIDORS · CLEAR AIRSPACE",
    verdictSubline: "Outside extended 12-degree runway cones or beyond 16 km radius",
  };
}

/**
 * Full deterministic aviation corridor & acoustic audit computation.
 */
export function computeCorridorAnalysis(input: {
  addressLat: number;
  addressLon: number;
  airport: AeroDataBoxAirportItem;
  runways?: AeroDataBoxRunwayItem[];
  schedule: AeroDataBoxScheduleResponse;
  weather: OpenMeteoHistoricalResponse;
}): CorridorAnalysis {
  const { addressLat, addressLon, airport, runways, schedule, weather } = input;

  const distanceKm =
    Math.round(
      haversineDistanceKm(
        airport.location.lat,
        airport.location.lon,
        addressLat,
        addressLon
      ) * 100
    ) / 100;

  const bearingFromAirportDeg =
    Math.round(
      compassBearingDeg(
        airport.location.lat,
        airport.location.lon,
        addressLat,
        addressLon
      ) * 10
    ) / 10;

  const { candidates, source: runwaySource } = normalizeRunwayCandidates(
    runways,
    airport.iata || airport.icao
  );

  const { directions: windDirections, meanSpeedKmh } = extractWindSamples(weather);
  const prevailingWindDeg = Math.round(circularMeanDeg(windDirections));
  const prevailingWindLabel = formatWindDirectionLabel(prevailingWindDeg);

  // Evaluate both Approach and Departure extended centerlines for every runway end.
  // - Landing on Runway R (heading trueHdg into wind FROM trueHdg): aircraft approaches FROM (trueHdg + 180) % 360.
  // - Departing on Runway R (heading trueHdg into wind FROM trueHdg): aircraft climbs out ALONG trueHdg.
  let bestMatch: {
    runwayName: string;
    runwayTrueHdg: number;
    corridorType: CorridorOperationType;
    angleOffsetDeg: number;
    activeWindPct: number;
  } | null = null;

  for (const rwy of candidates) {
    const approachCorridorBearing = (rwy.trueHdg + 180) % 360;
    const approachOffset = angularDifferenceDeg(
      bearingFromAirportDeg,
      approachCorridorBearing
    );
    const departureOffset = angularDifferenceDeg(
      bearingFromAirportDeg,
      rwy.trueHdg
    );
    const windPct = calculateWindExposurePct(windDirections, rwy.trueHdg);

    const options: Array<{
      corridorType: CorridorOperationType;
      angleOffsetDeg: number;
      activeWindPct: number;
    }> = [
      {
        corridorType: "APPROACH",
        angleOffsetDeg: approachOffset,
        activeWindPct: windPct,
      },
      {
        corridorType: "DEPARTURE",
        angleOffsetDeg: departureOffset,
        activeWindPct: windPct,
      },
    ];

    for (const opt of options) {
      if (!bestMatch) {
        bestMatch = {
          runwayName: rwy.name,
          runwayTrueHdg: rwy.trueHdg,
          ...opt,
        };
        continue;
      }

      // Prefer tightly aligned centerline; when two ends share the exact same centerline (approach 27L vs departure 09R),
      // select the one activated by prevailing wind!
      const offsetDelta = opt.angleOffsetDeg - bestMatch.angleOffsetDeg;
      if (offsetDelta < -0.6) {
        bestMatch = {
          runwayName: rwy.name,
          runwayTrueHdg: rwy.trueHdg,
          ...opt,
        };
      } else if (
        Math.abs(offsetDelta) <= 0.6 &&
        opt.activeWindPct > bestMatch.activeWindPct
      ) {
        bestMatch = {
          runwayName: rwy.name,
          runwayTrueHdg: rwy.trueHdg,
          ...opt,
        };
      }
    }
  }

  const resolved = bestMatch ?? {
    runwayName: "27",
    runwayTrueHdg: 270,
    corridorType: "OFF_AXIS" as CorridorOperationType,
    angleOffsetDeg: 45,
    activeWindPct: 50,
  };

  const angleOffsetDeg = Math.round(resolved.angleOffsetDeg * 10) / 10;
  const insideCone = distanceKm <= 16 && angleOffsetDeg <= 12;
  const corridorType: CorridorOperationType = insideCone
    ? resolved.corridorType
    : "OFF_AXIS";

  const { altitudeMeters, altitudeFeet } = estimateGlideslopeAltitude(
    distanceKm,
    corridorType
  );
  const { nightFlights, totalDailyMovements } = countNightMovements(schedule);
  const estimatedDb = estimatePeakOutdoorDb({
    distanceKm,
    angleOffsetDeg,
    altitudeMeters,
    insideCone,
    corridorType,
  });

  const { verdict, verdictHeadline, verdictSubline } = classifyVerdict({
    insideCone,
    distanceKm,
    nightFlights,
    totalDailyMovements,
    estimatedDb,
  });

  return {
    airportIata: airport.iata,
    airportIcao: airport.icao,
    airportName: airport.name,
    airportLat: airport.location.lat,
    airportLon: airport.location.lon,
    distanceKm,
    bearingFromAirportDeg,
    runwayName: resolved.runwayName,
    runwayTrueHdg: Math.round(resolved.runwayTrueHdg * 10) / 10,
    corridorType,
    angleOffsetDeg,
    insideCone,
    altitudeMeters,
    altitudeFeet,
    activeWindPct: resolved.activeWindPct,
    prevailingWindDeg,
    prevailingWindLabel,
    meanWindSpeedKmh: meanSpeedKmh,
    nightFlights,
    totalDailyMovements,
    estimatedDb,
    verdict,
    verdictHeadline,
    verdictSubline,
    runwaySource,
  };
}

/** Simple base32 geohash encoder (precision 6 ≈ 1.2 km, precision 7 ≈ 150 m). */
const GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(lat: number, lon: number, precision = 7): string {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (lon >= lonMid) {
        idx = idx * 2 + 1;
        lonMin = lonMid;
      } else {
        idx = idx * 2;
        lonMax = lonMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat >= latMid) {
        idx = idx * 2 + 1;
        latMin = latMid;
      } else {
        idx = idx * 2;
        latMax = latMid;
      }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      geohash += GEOHASH_BASE32.charAt(idx);
      bit = 0;
      idx = 0;
    }
  }
  return geohash;
}
