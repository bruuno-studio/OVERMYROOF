import { env as cfEnv } from "cloudflare:workers";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { AIRNODEHUB_CATALOG } from "@/lib/catalog";
import {
  angularDifferenceDeg,
  compassBearingDeg,
  computeCorridorAnalysis,
  encodeGeohash,
  haversineDistanceKm,
} from "@/lib/corridor";
import {
  decodeBase64Json,
  keccak256Hex,
  signX402Eip3009Payment,
  verifyAirnodeAttestation,
  type X402PaymentRequired,
} from "@/lib/crypto";
import {
  FALLBACK_AIRPORTS,
  findFallbackAirport,
  type FallbackAirportRecord,
} from "@/lib/runways";
import type {
  AeroDataBoxAirportItem,
  AeroDataBoxRunwayItem,
  AeroDataBoxScheduleResponse,
  AirnodeAttestationEnvelope,
  AirnodeCallRecord,
  AuditRecord,
  GeoapifyGeocodeResponse,
  OpenMeteoHistoricalResponse,
} from "@/lib/types";

export { AIRNODEHUB_CATALOG } from "@/lib/catalog";

export function readServerEnv(key: string): string | undefined {
  try {
    const record = cfEnv as Record<string, unknown> | undefined;
    if (record && typeof record[key] === "string" && record[key].length > 0) {
      return record[key] as string;
    }
  } catch {
    // Fallback to process.env outside Cloudflare Worker isolate
  }
  if (typeof process !== "undefined" && process.env?.[key]) {
    return process.env[key];
  }
  return undefined;
}

export function isDemoMode(): boolean {
  const flag = readServerEnv("DEMO_MODE")?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  // Auto-enable live mode when a valid wallet key is provisioned in Cloudflare Secrets
  const key = readServerEnv("AIRNODEHUB_WALLET_PRIVATE_KEY");
  return !key || key.trim().length < 64;
}

function getWalletPrivateKey(): string {
  const key = readServerEnv("AIRNODEHUB_WALLET_PRIVATE_KEY");
  if (!key || key.trim().length < 64) {
    throw new Error(
      "Missing AIRNODEHUB_WALLET_PRIVATE_KEY for live AirnodeHub x402 execution."
    );
  }
  return key.trim();
}

/** Deterministic edge-safe pseudo-hash (64 hex chars) for DEMO_MODE envelopes. */
function deterministicHex(seed: string, length = 64): string {
  let h1 = 0xdeadbeef ^ seed.length;
  let h2 = 0x41c6ce57 ^ seed.length;
  let out = "";
  let round = 0;
  while (out.length < length) {
    for (let i = 0; i < seed.length; i++) {
      const ch = seed.charCodeAt(i) + round * 31;
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 =
      Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
      Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 =
      Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
      Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const chunk =
      (h2 >>> 0).toString(16).padStart(8, "0") +
      (h1 >>> 0).toString(16).padStart(8, "0");
    out += chunk;
    round += 1;
  }
  return `0x${out.slice(0, length)}`;
}

function makeDemoEnvelope(
  airnode: string,
  operation: string,
  parameters: Record<string, string | number | boolean>,
  payload: unknown,
  timestampSec: string
): AirnodeAttestationEnvelope {
  const data = JSON.stringify(payload);
  const requestHash = deterministicHex(
    `${airnode}:${operation}:${JSON.stringify(parameters)}`,
    64
  );
  const signature = deterministicHex(
    `demo-eip191:${airnode}:${requestHash}:${timestampSec}:${data.slice(0, 256)}`,
    130
  );
  return {
    airnode,
    requestHash,
    timestamp: timestampSec,
    data,
    signature,
  };
}

/** Generate a realistic 90-day Open-Meteo historicalWeather wind dataset matching a target prevailing wind share. */
function buildDemoWindHistory(params: {
  lat: number;
  lon: number;
  timezone: string;
  timezoneAbbr: string;
  utcOffsetSeconds: number;
  dominantWindDeg: number;
  dominantSharePct: number;
  secondaryWindDeg: number;
  meanSpeedKmh: number;
}): OpenMeteoHistoricalResponse {
  const totalDays = 90;
  const dominantDays = Math.round((params.dominantSharePct / 100) * totalDays);
  const times: string[] = [];
  const directions: number[] = [];
  const speeds: number[] = [];

  const baseDate = new Date("2026-08-25T00:00:00Z");
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(baseDate.getTime() + i * 86400000);
    times.push(d.toISOString().slice(0, 10));
    const isDominant = i < dominantDays;
    const jitter = ((i * 17) % 37) - 18;
    const rawDeg = isDominant
      ? params.dominantWindDeg + jitter
      : params.secondaryWindDeg + jitter;
    directions.push(Math.round(((rawDeg % 360) + 360) % 360));
    const speedJitter = ((i * 7) % 11) - 5;
    speeds.push(
      Math.max(6, Math.round((params.meanSpeedKmh + speedJitter) * 10) / 10)
    );
  }

  return {
    latitude: params.lat,
    longitude: params.lon,
    elevation: 24,
    generationtime_ms: 0.42,
    utc_offset_seconds: params.utcOffsetSeconds,
    timezone: params.timezone,
    timezone_abbreviation: params.timezoneAbbr,
    daily_units: {
      time: "iso8601",
      wind_direction_10m_dominant: "°",
      wind_speed_10m_max: "km/h",
    },
    daily: {
      time: times,
      wind_direction_10m_dominant: directions,
      wind_speed_10m_max: speeds,
    },
  };
}

/** Build a realistic AeroDataBox airportSchedule response with an exact night movement count (23:00-06:00 local). */
function buildDemoSchedule(params: {
  airportIata: string;
  tzOffset: string;
  nightCount: number;
  dayCount: number;
  runwayName: string;
  airlines: Array<{ name: string; iata: string; aircraft: string }>;
}): AeroDataBoxScheduleResponse {
  const arrivals: NonNullable<AeroDataBoxScheduleResponse["arrivals"]> = [];
  const departures: NonNullable<AeroDataBoxScheduleResponse["departures"]> = [];

  const nightHours = [23, 0, 1, 2, 4, 5];
  const dayHours = [7, 8, 9, 10, 11, 13, 14, 15, 17, 18, 19, 20, 21, 22];

  for (let i = 0; i < params.nightCount; i++) {
    const carrier = params.airlines[i % params.airlines.length];
    const hour = nightHours[i % nightHours.length];
    const minute = (i * 11) % 60;
    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    const dateStr = hour === 23 ? "2026-11-22" : "2026-11-23";
    const movement = {
      number: `${carrier.iata} ${104 + i * 7}`,
      status: "Expected",
      airline: { name: carrier.name, iata: carrier.iata },
      aircraft: { model: carrier.aircraft },
      movement: {
        airport: { iata: params.airportIata },
        scheduledTime: {
          utc: `${dateStr} ${hh}:${mm}Z`,
          local: `${dateStr} ${hh}:${mm}${params.tzOffset}`,
        },
        runway: params.runwayName,
      },
    };
    if (i % 3 === 0) departures.push(movement);
    else arrivals.push(movement);
  }

  for (let i = 0; i < params.dayCount; i++) {
    const carrier = params.airlines[i % params.airlines.length];
    const hour = dayHours[i % dayHours.length];
    const minute = (i * 13) % 60;
    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    const movement = {
      number: `${carrier.iata} ${410 + i * 5}`,
      status: "Expected",
      airline: { name: carrier.name, iata: carrier.iata },
      aircraft: { model: carrier.aircraft },
      movement: {
        airport: { iata: params.airportIata },
        scheduledTime: {
          utc: `2026-11-23 ${hh}:${mm}Z`,
          local: `2026-11-23 ${hh}:${mm}${params.tzOffset}`,
        },
        runway: params.runwayName,
      },
    };
    if (i % 2 === 0) arrivals.push(movement);
    else departures.push(movement);
  }

  return { arrivals, departures };
}

interface DemoFixtureSpec {
  id: string;
  queryAddress: string;
  formattedAddress: string;
  neighborhoodLabel: string;
  cityLabel: string;
  country: string;
  countryCode: string;
  postcode: string;
  lat: number;
  lon: number;
  timezone: string;
  timezoneAbbr: string;
  tzOffset: string;
  utcOffsetSeconds: number;
  airport: AeroDataBoxAirportItem;
  runways: AeroDataBoxRunwayItem[];
  dominantWindDeg: number;
  dominantSharePct: number;
  secondaryWindDeg: number;
  meanSpeedKmh: number;
  nightCount: number;
  dayCount: number;
  primaryRunwayLabel: string;
  airlines: Array<{ name: string; iata: string; aircraft: string }>;
  featuredBlurb: string;
  matchKeywords: string[];
}

const DEMO_FIXTURES: DemoFixtureSpec[] = [
  {
    id: "lhr-hounslow",
    queryAddress: "118 Bath Rd, Hounslow West, London TW4 7ED",
    formattedAddress: "118 Bath Rd, Hounslow West, London TW4 7ED, United Kingdom",
    neighborhoodLabel: "Hounslow West",
    cityLabel: "London, UK",
    country: "United Kingdom",
    countryCode: "GB",
    postcode: "TW4 7ED",
    lat: 51.4675,
    lon: -0.3936,
    timezone: "Europe/London",
    timezoneAbbr: "GMT",
    tzOffset: "+00:00",
    utcOffsetSeconds: 0,
    airport: {
      icao: "EGLL",
      iata: "LHR",
      shortName: "Heathrow",
      name: "London Heathrow Airport",
      municipalityName: "London",
      location: { lat: 51.4649, lon: -0.4528 },
      countryCode: "GB",
    },
    runways: [
      { name: "27L", trueHdg: 269.7, length: { meter: 3658, feet: 12001 }, isClosed: false, surface: "Asphalt", hasLighting: true },
      { name: "09R", trueHdg: 89.7, length: { meter: 3658, feet: 12001 }, isClosed: false, surface: "Asphalt", hasLighting: true },
      { name: "27R", trueHdg: 269.7, length: { meter: 3902, feet: 12802 }, isClosed: false, surface: "Asphalt", hasLighting: true },
      { name: "09L", trueHdg: 89.7, length: { meter: 3902, feet: 12802 }, isClosed: false, surface: "Asphalt", hasLighting: true },
    ],
    dominantWindDeg: 265,
    dominantSharePct: 68,
    secondaryWindDeg: 92,
    meanSpeedKmh: 21.4,
    nightCount: 24,
    dayCount: 86,
    primaryRunwayLabel: "27L",
    airlines: [
      { name: "British Airways", iata: "BA", aircraft: "Airbus A350-1000" },
      { name: "Virgin Atlantic", iata: "VS", aircraft: "Boeing 787-9" },
      { name: "United Airlines", iata: "UA", aircraft: "Boeing 777-200ER" },
      { name: "Qantas", iata: "QF", aircraft: "Airbus A380-800" },
    ],
    featuredBlurb: "Direct under LHR Runway 27L final approach on westerly operations",
    matchKeywords: ["hounslow", "bath rd", "heathrow", "tw4", "tw3", "lhr"],
  },
  {
    id: "lax-el-segundo",
    queryAddress: "420 W Imperial Ave, El Segundo, CA 90245",
    formattedAddress: "420 W Imperial Ave, El Segundo, CA 90245, United States",
    neighborhoodLabel: "El Segundo",
    cityLabel: "Los Angeles, US",
    country: "United States",
    countryCode: "US",
    postcode: "90245",
    lat: 33.9338,
    lon: -118.431,
    timezone: "America/Los_Angeles",
    timezoneAbbr: "PST",
    tzOffset: "-08:00",
    utcOffsetSeconds: -28800,
    airport: {
      icao: "KLAX",
      iata: "LAX",
      shortName: "Los Angeles",
      name: "Los Angeles International Airport",
      municipalityName: "Los Angeles",
      location: { lat: 33.9371, lon: -118.4081 },
      countryCode: "US",
    },
    runways: [
      { name: "25L", trueHdg: 263, length: { meter: 3382, feet: 11096 }, isClosed: false, surface: "Concrete", hasLighting: true },
      { name: "07R", trueHdg: 83, length: { meter: 3382, feet: 11096 }, isClosed: false, surface: "Concrete", hasLighting: true },
      { name: "25R", trueHdg: 263, length: { meter: 3939, feet: 12923 }, isClosed: false, surface: "Concrete", hasLighting: true },
      { name: "07L", trueHdg: 83, length: { meter: 3939, feet: 12923 }, isClosed: false, surface: "Concrete", hasLighting: true },
    ],
    dominantWindDeg: 261,
    dominantSharePct: 76,
    secondaryWindDeg: 78,
    meanSpeedKmh: 16.8,
    nightCount: 31,
    dayCount: 94,
    primaryRunwayLabel: "25L",
    airlines: [
      { name: "Delta Air Lines", iata: "DL", aircraft: "Airbus A321neo" },
      { name: "American Airlines", iata: "AA", aircraft: "Boeing 777-300ER" },
      { name: "Southwest Airlines", iata: "WN", aircraft: "Boeing 737 MAX 8" },
      { name: "ANA", iata: "NH", aircraft: "Boeing 787-9" },
    ],
    featuredBlurb: "South perimeter of LAX Runway 25L heavy westbound departure climb",
    matchKeywords: ["el segundo", "imperial ave", "90245", "lax", "playa del rey", "inglewood"],
  },
  {
    id: "lga-astoria",
    queryAddress: "23-15 Ditmars Blvd, Astoria, Queens, NY 11105",
    formattedAddress: "23-15 Ditmars Blvd, Astoria, Queens, NY 11105, United States",
    neighborhoodLabel: "Astoria · Ditmars",
    cityLabel: "Queens, NY",
    country: "United States",
    countryCode: "US",
    postcode: "11105",
    lat: 40.7757,
    lon: -73.9122,
    timezone: "America/New_York",
    timezoneAbbr: "EST",
    tzOffset: "-05:00",
    utcOffsetSeconds: -18000,
    airport: {
      icao: "KLGA",
      iata: "LGA",
      shortName: "LaGuardia",
      name: "LaGuardia Airport",
      municipalityName: "New York",
      location: { lat: 40.7769, lon: -73.874 },
      countryCode: "US",
    },
    runways: [
      { name: "13", trueHdg: 121, length: { meter: 2135, feet: 7003 }, isClosed: false, surface: "Asphalt", hasLighting: true },
      { name: "31", trueHdg: 301, length: { meter: 2135, feet: 7003 }, isClosed: false, surface: "Asphalt", hasLighting: true },
      { name: "04", trueHdg: 31, length: { meter: 2134, feet: 7001 }, isClosed: false, surface: "Asphalt", hasLighting: true },
      { name: "22", trueHdg: 211, length: { meter: 2134, feet: 7001 }, isClosed: false, surface: "Asphalt", hasLighting: true },
    ],
    dominantWindDeg: 294,
    dominantSharePct: 58,
    secondaryWindDeg: 145,
    meanSpeedKmh: 19.2,
    nightCount: 14,
    dayCount: 78,
    primaryRunwayLabel: "31",
    airlines: [
      { name: "Delta Air Lines", iata: "DL", aircraft: "Airbus A220-300" },
      { name: "American Airlines", iata: "AA", aircraft: "Airbus A319" },
      { name: "JetBlue", iata: "B6", aircraft: "Embraer E190" },
      { name: "United Airlines", iata: "UA", aircraft: "Boeing 737-800" },
    ],
    featuredBlurb: "Near-field LGA Runway 13/31 corridor 3.2 km west of Flushing Bay",
    matchKeywords: ["ditmars", "astoria", "queens", "11105", "lga", "laguardia"],
  },
  {
    id: "saw-pendik",
    queryAddress: "Yayalar Mahallesi, Pendik, Istanbul 34899",
    formattedAddress: "Yayalar Mahallesi, Pendik, 34899 Istanbul, Turkey",
    neighborhoodLabel: "Yayalar · Pendik",
    cityLabel: "Istanbul, TR",
    country: "Turkey",
    countryCode: "TR",
    postcode: "34899",
    lat: 40.8824,
    lon: 29.2721,
    timezone: "Europe/Istanbul",
    timezoneAbbr: "TRT",
    tzOffset: "+03:00",
    utcOffsetSeconds: 10800,
    airport: {
      icao: "LTFJ",
      iata: "SAW",
      shortName: "Sabiha Gokcen",
      name: "Istanbul Sabiha Gokcen International Airport",
      municipalityName: "Istanbul",
      location: { lat: 40.8986, lon: 29.3092 },
      countryCode: "TR",
    },
    runways: [
      { name: "06R", trueHdg: 60, length: { meter: 3540, feet: 11614 }, isClosed: false, surface: "Concrete", hasLighting: true },
      { name: "24L", trueHdg: 240, length: { meter: 3540, feet: 11614 }, isClosed: false, surface: "Concrete", hasLighting: true },
      { name: "06L", trueHdg: 60, length: { meter: 3000, feet: 9843 }, isClosed: false, surface: "Concrete", hasLighting: true },
      { name: "24R", trueHdg: 240, length: { meter: 3000, feet: 9843 }, isClosed: false, surface: "Concrete", hasLighting: true },
    ],
    dominantWindDeg: 54,
    dominantSharePct: 64,
    secondaryWindDeg: 235,
    meanSpeedKmh: 21.6,
    nightCount: 22,
    dayCount: 84,
    primaryRunwayLabel: "06R",
    airlines: [
      { name: "Pegasus Airlines", iata: "PC", aircraft: "Airbus A321neo" },
      { name: "AJet", iata: "VF", aircraft: "Boeing 737-800" },
      { name: "Emirates", iata: "EK", aircraft: "Boeing 777-300ER" },
    ],
    featuredBlurb: "Directly under Sabiha Gokcen (SAW) Runway 06R final approach under NE Poyraz winds",
    matchKeywords: ["pendik", "yayalar", "kurtkoy", "velibaba", "sabiha", "saw", "florya", "istanbul"],
  },
  {
    id: "ldn-hampstead",
    queryAddress: "14 Flask Walk, Hampstead Village, London NW3 1HE",
    formattedAddress: "14 Flask Walk, Hampstead Village, London NW3 1HE, United Kingdom",
    neighborhoodLabel: "Hampstead Village",
    cityLabel: "London, UK",
    country: "United Kingdom",
    countryCode: "GB",
    postcode: "NW3 1HE",
    lat: 51.5565,
    lon: -0.178,
    timezone: "Europe/London",
    timezoneAbbr: "GMT",
    tzOffset: "+00:00",
    utcOffsetSeconds: 0,
    airport: {
      icao: "EGLL",
      iata: "LHR",
      shortName: "Heathrow",
      name: "London Heathrow Airport",
      municipalityName: "London",
      location: { lat: 51.4649, lon: -0.4528 },
      countryCode: "GB",
    },
    runways: [
      { name: "27L", trueHdg: 269.7, length: { meter: 3658, feet: 12001 }, isClosed: false, surface: "Asphalt", hasLighting: true },
      { name: "09R", trueHdg: 89.7, length: { meter: 3658, feet: 12001 }, isClosed: false, surface: "Asphalt", hasLighting: true },
      { name: "27R", trueHdg: 269.7, length: { meter: 3902, feet: 12802 }, isClosed: false, surface: "Asphalt", hasLighting: true },
      { name: "09L", trueHdg: 89.7, length: { meter: 3902, feet: 12802 }, isClosed: false, surface: "Asphalt", hasLighting: true },
    ],
    dominantWindDeg: 265,
    dominantSharePct: 68,
    secondaryWindDeg: 92,
    meanSpeedKmh: 18.6,
    nightCount: 24,
    dayCount: 86,
    primaryRunwayLabel: "27L",
    airlines: [
      { name: "British Airways", iata: "BA", aircraft: "Airbus A350-1000" },
      { name: "Virgin Atlantic", iata: "VS", aircraft: "Boeing 787-9" },
    ],
    featuredBlurb: "Clear-airspace control baseline 21.4 km northeast and off-axis from LHR",
    matchKeywords: ["hampstead", "flask walk", "nw3", "clear"],
  },
];

function buildAuditFromFixture(
  spec: DemoFixtureSpec,
  overrideId?: string,
  overrideQuery?: string
): AuditRecord {
  const timestampSec = "1795462210";
  const createdAt = "2026-11-23T19:30:10.000Z";
  const queryAddress = overrideQuery ?? spec.queryAddress;

  const geocodePayload: GeoapifyGeocodeResponse = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: spec.neighborhoodLabel,
          country: spec.country,
          country_code: spec.countryCode.toLowerCase(),
          city: spec.cityLabel.split(",")[0].trim(),
          postcode: spec.postcode,
          suburb: spec.neighborhoodLabel,
          lon: spec.lon,
          lat: spec.lat,
          formatted: spec.formattedAddress,
          address_line1: queryAddress.split(",")[0].trim(),
          address_line2: spec.cityLabel,
          result_type: "street",
          timezone: {
            name: spec.timezone,
            offset_STD: spec.tzOffset,
          },
        },
        geometry: {
          type: "Point",
          coordinates: [spec.lon, spec.lat],
        },
      },
    ],
    query: { text: queryAddress },
  };

  const airportSearchPayload = {
    searchBy: { lat: spec.lat, lon: spec.lon },
    count: 1,
    items: [spec.airport],
  };

  const runwaysPayload = spec.runways;

  const schedulePayload = buildDemoSchedule({
    airportIata: spec.airport.iata,
    tzOffset: spec.tzOffset,
    nightCount: spec.nightCount,
    dayCount: spec.dayCount,
    runwayName: spec.primaryRunwayLabel,
    airlines: spec.airlines,
  });

  const weatherPayload = buildDemoWindHistory({
    lat: spec.airport.location.lat,
    lon: spec.airport.location.lon,
    timezone: spec.timezone,
    timezoneAbbr: spec.timezoneAbbr,
    utcOffsetSeconds: spec.utcOffsetSeconds,
    dominantWindDeg: spec.dominantWindDeg,
    dominantSharePct: spec.dominantSharePct,
    secondaryWindDeg: spec.secondaryWindDeg,
    meanSpeedKmh: spec.meanSpeedKmh,
  });

  const analysis = computeCorridorAnalysis({
    addressLat: spec.lat,
    addressLon: spec.lon,
    airport: spec.airport,
    runways: spec.runways,
    schedule: schedulePayload,
    weather: weatherPayload,
  });

  const geoParams = { text: queryAddress, limit: 1, bias: "countrycode:none" };
  const aptSearchParams = {
    lat: spec.lat,
    lon: spec.lon,
    radiusKm: 25,
    limit: 5,
    withFlightInfoOnly: true,
  };
  const rwyParams = { codeType: "iata", code: spec.airport.iata };
  const schedParams = {
    codeType: "iata",
    code: spec.airport.iata,
    offsetMinutes: -720,
    durationMinutes: 720,
    direction: "Both",
    withCancelled: false,
    withCodeshared: false,
  };
  const weatherParams = {
    latitude: String(spec.airport.location.lat),
    longitude: String(spec.airport.location.lon),
    start_date: "2026-08-25",
    end_date: "2026-11-22",
    daily: "wind_direction_10m_dominant,wind_speed_10m_max",
    wind_speed_unit: "kmh",
    timezone: "auto",
  };

  const attestations: AirnodeCallRecord[] = [
    {
      provider: "geoapify",
      endpoint: AIRNODEHUB_CATALOG.providers.geoapify.baseUrl,
      operation: "geocode",
      parameters: geoParams,
      priceUsd: 0,
      mode: "DEMO",
      attestation: makeDemoEnvelope(
        AIRNODEHUB_CATALOG.providers.geoapify.address,
        "geocode",
        geoParams,
        geocodePayload,
        timestampSec
      ),
    },
    {
      provider: "aerodatabox",
      endpoint: AIRNODEHUB_CATALOG.providers.aerodatabox.baseUrl,
      operation: "searchAirportsByLocation",
      parameters: aptSearchParams,
      priceUsd: 0.05,
      mode: "DEMO",
      attestation: makeDemoEnvelope(
        AIRNODEHUB_CATALOG.providers.aerodatabox.address,
        "searchAirportsByLocation",
        aptSearchParams,
        airportSearchPayload,
        timestampSec
      ),
    },
    {
      provider: "aerodatabox",
      endpoint: AIRNODEHUB_CATALOG.providers.aerodatabox.baseUrl,
      operation: "airportRunways",
      parameters: rwyParams,
      priceUsd: 0.02,
      mode: "DEMO",
      attestation: makeDemoEnvelope(
        AIRNODEHUB_CATALOG.providers.aerodatabox.address,
        "airportRunways",
        rwyParams,
        runwaysPayload,
        timestampSec
      ),
    },
    {
      provider: "aerodatabox",
      endpoint: AIRNODEHUB_CATALOG.providers.aerodatabox.baseUrl,
      operation: "airportSchedule",
      parameters: schedParams,
      priceUsd: 0.05,
      mode: "DEMO",
      attestation: makeDemoEnvelope(
        AIRNODEHUB_CATALOG.providers.aerodatabox.address,
        "airportSchedule",
        schedParams,
        schedulePayload,
        timestampSec
      ),
    },
    {
      provider: "open-meteo",
      endpoint: AIRNODEHUB_CATALOG.providers.openMeteo.baseUrl,
      operation: "historicalWeather",
      parameters: weatherParams,
      priceUsd: 0.1,
      mode: "DEMO",
      attestation: makeDemoEnvelope(
        AIRNODEHUB_CATALOG.providers.openMeteo.address,
        "historicalWeather",
        weatherParams,
        weatherPayload,
        timestampSec
      ),
    },
  ];

  const totalCostUsd =
    Math.round(
      attestations.reduce((sum, item) => sum + item.priceUsd, 0) * 100
    ) / 100;

  const combinedProofHash = deterministicHex(
    attestations.map((a) => a.attestation.signature).join("|"),
    64
  );

  return {
    id: overrideId ?? spec.id,
    slug: spec.id,
    createdAt,
    mode: "DEMO",
    queryAddress,
    formattedAddress: spec.formattedAddress,
    neighborhoodLabel: spec.neighborhoodLabel,
    cityLabel: spec.cityLabel,
    countryCode: spec.countryCode,
    lat: spec.lat,
    lon: spec.lon,
    geohash: encodeGeohash(spec.lat, spec.lon, 7),
    analysis,
    attestations,
    combinedProofHash,
    totalCostUsd,
    featured: !overrideId,
    featuredBlurb: spec.featuredBlurb,
  };
}

let cachedFeaturedAudits: AuditRecord[] | null = null;

export function getFeaturedDemoAudits(): AuditRecord[] {
  if (!cachedFeaturedAudits) {
    cachedFeaturedAudits = DEMO_FIXTURES.map((spec) =>
      buildAuditFromFixture(spec)
    );
  }
  return cachedFeaturedAudits;
}

// ============================================================================
// PHASE 2: LIVE AIRNODEHUB x402 CLIENT & SERVER-SIDE PAYMENT SETTLEMENT
// ============================================================================

interface PaymentResponseReceipt {
  success?: boolean;
  transaction?: string;
  txHash?: string;
  network?: string;
  payer?: string;
}

function getProviderMeta(provider: AirnodeCallRecord["provider"]) {
  switch (provider) {
    case "geoapify":
      return AIRNODEHUB_CATALOG.providers.geoapify;
    case "aerodatabox":
      return AIRNODEHUB_CATALOG.providers.aerodatabox;
    case "open-meteo":
      return AIRNODEHUB_CATALOG.providers.openMeteo;
  }
}

/**
 * Executes a single live AirnodeHub POST / call with automatic x402 v2 EIP-3009 aUSD payment
 * and immediate EIP-191 secp256k1 signature verification.
 */
export async function callLiveAirnode<T>(params: {
  provider: AirnodeCallRecord["provider"];
  operation: string;
  parameters: Record<string, string | number | boolean>;
  maxCallUsd: number;
  privateKeyHex: string;
}): Promise<{ parsed: T; record: AirnodeCallRecord }> {
  const { provider, operation, parameters, maxCallUsd, privateKeyHex } = params;
  const meta = getProviderMeta(provider);
  const url = `${meta.baseUrl}/`;
  const requestBody = JSON.stringify({ operation, parameters });

  let response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  });

  let paidUsd = 0;
  let settlementTx: string | undefined;
  let settlementNetwork: string | undefined;

  if (response.status === 402) {
    const reqHeader = response.headers.get("payment-required");
    if (!reqHeader) {
      throw new Error(
        `Airnode ${provider}.${operation} returned 402 without PAYMENT-REQUIRED header`
      );
    }

    const paymentRequired = decodeBase64Json<X402PaymentRequired>(reqHeader);
    const signedPayment = signX402Eip3009Payment({
      privateKeyHex,
      paymentRequired,
      maxCallUsd,
    });
    paidUsd = signedPayment.paidUsd;

    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-SIGNATURE": signedPayment.paymentSignatureHeader,
      },
      body: requestBody,
    });

    const receiptHeader = response.headers.get("payment-response");
    if (receiptHeader) {
      try {
        const receipt = decodeBase64Json<PaymentResponseReceipt>(receiptHeader);
        settlementTx = receipt.transaction || receipt.txHash;
        settlementNetwork = receipt.network || "eip155:84532";
      } catch {
        // Ignore unparseable settlement receipt header
      }
    }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Airnode ${provider}.${operation} failed (${response.status}): ${errText.slice(0, 260)}`
    );
  }

  const attestation = (await response.json()) as AirnodeAttestationEnvelope;
  const verifyResult = verifyAirnodeAttestation({
    operation,
    parameters,
    attestation,
    expectedAirnode: meta.address,
  });

  if (!verifyResult.valid) {
    throw new Error(
      `Cryptographic attestation check failed for ${provider}.${operation}: ${verifyResult.reason}`
    );
  }

  const parsed = JSON.parse(attestation.data) as T;

  const record: AirnodeCallRecord = {
    provider,
    endpoint: meta.baseUrl,
    operation,
    parameters,
    priceUsd: paidUsd,
    mode: "LIVE",
    attestation,
    settlementTx,
    settlementNetwork,
    verifiedAtFetch: true,
  };

  return { parsed, record };
}

/**
 * Compute an AeroDataBox offsetMinutes within [-720, +720] so a 12-hour durationMinutes=720
 * window always covers the entire 23:00 to 06:00 local night window.
 */
function computeNightWindowOffsetMinutes(utcOffsetSeconds: number): number {
  const nowUtcMs = Date.now();
  const localDate = new Date(nowUtcMs + utcOffsetSeconds * 1000);
  const localHourFloat =
    localDate.getUTCHours() + localDate.getUTCMinutes() / 60;

  // Target 21:00 -> 09:00 local (12 hours, fully covering 23:00..06:00)
  let deltaHours: number;
  if (localHourFloat >= 9 && localHourFloat <= 21) {
    deltaHours = 21 - localHourFloat; // 0..+12h
  } else if (localHourFloat < 9) {
    deltaHours = 21 - 24 - localHourFloat; // -3..-12h
  } else {
    deltaHours = 21 - localHourFloat; // -3..0h
  }
  const offset = Math.round(deltaHours * 60);
  return Math.max(-720, Math.min(720, offset));
}

function formatUtcDateDaysAgo(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
}

export interface RunAuditOptions {
  /** Optional ~200m geohash + date cache resolver to skip redundant paid AirnodeHub calls. */
  lookupByGeohash?: (
    geohash: string,
    dateIso: string
  ) => Promise<AuditRecord | null>;
}

async function runLiveAddressAudit(
  rawAddress: string,
  options?: RunAuditOptions
): Promise<{ audit: AuditRecord; cacheHit: boolean }> {
  const privateKeyHex = getWalletPrivateKey();
  const attestations: AirnodeCallRecord[] = [];

  // 1. Geoapify geocode (FREE)
  const geoCall = await callLiveAirnode<GeoapifyGeocodeResponse>({
    provider: "geoapify",
    operation: "geocode",
    parameters: { text: rawAddress, limit: 1, bias: "countrycode:none" },
    maxCallUsd: 0.05,
    privateKeyHex,
  });
  attestations.push(geoCall.record);

  const feature = geoCall.parsed.features?.[0];
  if (!feature) {
    throw new Error(
      `Could not geocode "${rawAddress}". Try adding a city or country (e.g., "Hounslow West, London").`
    );
  }

  const props = feature.properties;
  const lat = Number(props.lat);
  const lon = Number(props.lon);
  const geohash = encodeGeohash(lat, lon, 7);
  const todayIso = new Date().toISOString().slice(0, 10);

  // Check ~150m-200m geohash + date cache BEFORE executing paid AeroDataBox & Open-Meteo calls!
  if (options?.lookupByGeohash) {
    const cached = await options.lookupByGeohash(geohash, todayIso);
    if (cached && cached.mode === "LIVE") {
      return { audit: cached, cacheHit: true };
    }
  }
  const formattedAddress = props.formatted || rawAddress;
  const neighborhoodLabel =
    props.suburb ||
    props.district ||
    props.name ||
    props.address_line1 ||
    rawAddress.split(",")[0].trim();
  const cityParts = [props.city || props.state, props.country_code?.toUpperCase()].filter(
    Boolean
  );
  const cityLabel = cityParts.join(", ") || props.country || "GLOBAL";
  const countryCode = (props.country_code || "XX").toUpperCase();

  // Approximate UTC offset from Geoapify timezone or longitude
  const utcOffsetSeconds =
    typeof props.timezone?.offset_STD_seconds === "number"
      ? props.timezone.offset_STD_seconds
      : Math.round(lon / 15) * 3600;

  // 2. AeroDataBox searchAirportsByLocation ($0.05 aUSD)
  const aptSearchCall = await callLiveAirnode<{
    searchBy: unknown;
    count: number;
    items?: AeroDataBoxAirportItem[];
  }>({
    provider: "aerodatabox",
    operation: "searchAirportsByLocation",
    parameters: {
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
      radiusKm: 25,
      limit: 5,
      withFlightInfoOnly: true,
    },
    maxCallUsd: 0.1,
    privateKeyHex,
  });
  attestations.push(aptSearchCall.record);

  // Closed / non-commercial passenger fields that should yield to active nearby hubs when both appear within 25 km
  const DEPRIORITIZED_ICAOS = new Set(["LTBA", "EDDT", "VHHH_OLD"]);

  const liveAirports = (aptSearchCall.parsed.items ?? []).filter(
    (item) => item.location && (item.iata || item.icao)
  );

  // Smart multi-airport selection: among candidates within 25 km, prefer active commercial IATA airports
  // whose known runway corridor actually intersects the address, over minor/closed airfields.
  let nearestAirport: AeroDataBoxAirportItem | null = null;
  let bestScore = -Infinity;
  for (const item of liveAirports) {
    const d = haversineDistanceKm(
      lat,
      lon,
      item.location.lat,
      item.location.lon
    );
    const hasIata = Boolean(item.iata && item.iata.trim().length === 3);
    const knownHub = findFallbackAirport(item.iata || item.icao);
    const isDeprioritized = DEPRIORITIZED_ICAOS.has((item.icao || "").toUpperCase());

    let alignedWithRunway = false;
    if (knownHub && d <= 16) {
      const bearing = compassBearingDeg(item.location.lat, item.location.lon, lat, lon);
      alignedWithRunway = knownHub.runways.some(
        (r) =>
          angularDifferenceDeg(bearing, r.trueHdg) <= 12 ||
          angularDifferenceDeg(bearing, (r.trueHdg + 180) % 360) <= 12
      );
    }

    const score =
      (26 - Math.min(d, 26)) * 2.5 +
      (hasIata ? 14 : 0) +
      (knownHub ? 8 : 0) +
      (alignedWithRunway ? 22 : 0) -
      (isDeprioritized ? 30 : 0);

    if (score > bestScore) {
      bestScore = score;
      nearestAirport = item;
    }
  }

  let runwaysData: AeroDataBoxRunwayItem[] | undefined;
  let scheduleData: AeroDataBoxScheduleResponse = {
    arrivals: [],
    departures: [],
  };
  let weatherData: OpenMeteoHistoricalResponse;
  let noNearbyAirport = false;

  // Date window for Open-Meteo 90-day climatology (respects ~5-7 day ERA5 archive reanalysis lag)
  const startDate = formatUtcDateDaysAgo(97);
  const endDate = formatUtcDateDaysAgo(7);

  if (nearestAirport) {
    const codeType = nearestAirport.iata ? "iata" : "icao";
    const code = (nearestAirport.iata || nearestAirport.icao).toUpperCase();
    const offsetMinutes = computeNightWindowOffsetMinutes(utcOffsetSeconds);

    // 3, 4, 5 in parallel: airportRunways ($0.02) + airportSchedule ($0.05) + Open-Meteo historicalWeather ($0.10)
    const [runwaysResult, scheduleResult, weatherResult] =
      await Promise.allSettled([
        callLiveAirnode<AeroDataBoxRunwayItem[]>({
          provider: "aerodatabox",
          operation: "airportRunways",
          parameters: { codeType, code },
          maxCallUsd: 0.05,
          privateKeyHex,
        }),
        callLiveAirnode<AeroDataBoxScheduleResponse>({
          provider: "aerodatabox",
          operation: "airportSchedule",
          parameters: {
            codeType,
            code,
            offsetMinutes,
            durationMinutes: 720,
            direction: "Both",
            withCancelled: false,
            withCodeshared: false,
            withCargo: true,
            withPrivate: false,
          },
          maxCallUsd: 0.1,
          privateKeyHex,
        }),
        callLiveAirnode<OpenMeteoHistoricalResponse>({
          provider: "open-meteo",
          operation: "historicalWeather",
          parameters: {
            latitude: nearestAirport.location.lat.toFixed(4),
            longitude: nearestAirport.location.lon.toFixed(4),
            start_date: startDate,
            end_date: endDate,
            daily: "wind_direction_10m_dominant,wind_speed_10m_max",
            wind_speed_unit: "kmh",
            timezone: "auto",
          },
          maxCallUsd: 0.15,
          privateKeyHex,
        }),
      ]);

    if (runwaysResult.status === "fulfilled") {
      runwaysData = runwaysResult.value.parsed;
      attestations.push(runwaysResult.value.record);
    }

    if (scheduleResult.status === "fulfilled") {
      scheduleData = scheduleResult.value.parsed;
      attestations.push(scheduleResult.value.record);
    } else {
      // Retry once with standard -120..+600 default window if offset was rejected upstream
      try {
        const retrySched = await callLiveAirnode<AeroDataBoxScheduleResponse>({
          provider: "aerodatabox",
          operation: "airportSchedule",
          parameters: {
            codeType,
            code,
            offsetMinutes: -120,
            durationMinutes: 720,
            direction: "Both",
            withCancelled: false,
            withCodeshared: false,
          },
          maxCallUsd: 0.1,
          privateKeyHex,
        });
        scheduleData = retrySched.parsed;
        attestations.push(retrySched.record);
      } catch {
        // Proceed with 0 scheduled flights if airport has no live schedule feed
      }
    }

    if (weatherResult.status === "fulfilled") {
      weatherData = weatherResult.value.parsed;
      attestations.push(weatherResult.value.record);
    } else {
      throw new Error(
        `Open-Meteo historicalWeather call failed: ${weatherResult.reason instanceof Error ? weatherResult.reason.message : String(weatherResult.reason)}`
      );
    }
  } else {
    // No commercial airport within 25 km -> guaranteed CLEAR_AIRSPACE!
    // Skip paid $0.10 Open-Meteo call to save x402 aUSD on remote/rural locations.
    noNearbyAirport = true;
    let closestFallback = FALLBACK_AIRPORTS[0];
    let minFallbackDist = Infinity;
    for (const hub of FALLBACK_AIRPORTS) {
      const d = haversineDistanceKm(lat, lon, hub.lat, hub.lon);
      if (d < minFallbackDist) {
        minFallbackDist = d;
        closestFallback = hub;
      }
    }
    nearestAirport = {
      icao: closestFallback.icao,
      iata: closestFallback.iata,
      shortName: closestFallback.city,
      name: closestFallback.name,
      municipalityName: closestFallback.city,
      location: { lat: closestFallback.lat, lon: closestFallback.lon },
      countryCode: closestFallback.countryCode,
    };

    weatherData = {
      latitude: lat,
      longitude: lon,
      elevation: 0,
      generationtime_ms: 0,
      utc_offset_seconds: utcOffsetSeconds,
      timezone: props.timezone?.name || "UTC",
      timezone_abbreviation: "UTC",
      daily: {
        time: [],
        wind_direction_10m_dominant: [],
        wind_speed_10m_max: [],
      },
    };
  }

  const analysis = {
    ...computeCorridorAnalysis({
      addressLat: lat,
      addressLon: lon,
      airport: nearestAirport,
      runways: runwaysData,
      schedule: scheduleData,
      weather: weatherData,
    }),
    noNearbyAirport: noNearbyAirport || undefined,
  };

  const combinedProofHash = keccak256Hex(
    utf8ToBytes(attestations.map((a) => a.attestation.signature).join("|"))
  );
  const totalCostUsd =
    Math.round(
      attestations.reduce((sum, item) => sum + item.priceUsd, 0) * 100
    ) / 100;

  const shortId = `${analysis.airportIata.toLowerCase()}-${combinedProofHash.slice(2, 10)}`;

  return {
    cacheHit: false,
    audit: {
      id: shortId,
      createdAt: new Date().toISOString(),
      mode: "LIVE",
      queryAddress: rawAddress,
      formattedAddress,
      neighborhoodLabel,
      cityLabel,
      countryCode,
      lat,
      lon,
      geohash,
      analysis,
      attestations,
      combinedProofHash,
      totalCostUsd,
    },
  };
}

/**
 * Resolve any address query.
 * - When DEMO_MODE=true: returns zero-cost AirnodeHub-schema demo fixtures.
 * - When DEMO_MODE=false: settles live x402 aUSD calls against Geoapify, AeroDataBox, and Open-Meteo.
 */
export async function runAddressAudit(
  rawAddress: string,
  options?: RunAuditOptions
): Promise<{ audit: AuditRecord; cacheHit: boolean }> {
  const cleaned = rawAddress.trim();

  if (!isDemoMode()) {
    return runLiveAddressAudit(cleaned, options);
  }

  const lower = cleaned.toLowerCase();

  // 1. Direct match against one of the 5 featured global fixtures
  const featuredMatch = DEMO_FIXTURES.find((spec) =>
    spec.matchKeywords.some((kw) => lower.includes(kw))
  );
  if (featuredMatch) {
    if (
      lower === featuredMatch.queryAddress.toLowerCase() ||
      lower === featuredMatch.neighborhoodLabel.toLowerCase() ||
      lower === featuredMatch.id
    ) {
      return {
        cacheHit: true,
        audit:
          getFeaturedDemoAudits().find((a) => a.id === featuredMatch.id) ??
          buildAuditFromFixture(featuredMatch),
      };
    }
    const shortId = `demo-${deterministicHex(lower, 8).slice(2, 10)}`;
    return {
      cacheHit: false,
      audit: buildAuditFromFixture(featuredMatch, shortId, cleaned),
    };
  }

  const normalizeAscii = (s: string) =>
    s
      .toLowerCase()
      .replace(/ı/g, "i")
      .replace(/İ/g, "i")
      .replace(/ş/g, "s")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const normalizedQuery = normalizeAscii(cleaned);

  // 2. Match any global airport city / IATA / ICAO from the 125-hub fallback table
  let matchedHub: FallbackAirportRecord | undefined = FALLBACK_AIRPORTS.find(
    (hub) =>
      normalizedQuery.includes(normalizeAscii(hub.city)) ||
      new RegExp(`\\b${hub.iata.toLowerCase()}\\b`).test(normalizedQuery) ||
      new RegExp(`\\b${hub.icao.toLowerCase()}\\b`).test(normalizedQuery)
  );

  const hashHex = deterministicHex(lower, 16).slice(2);
  const hashNum = Number.parseInt(hashHex.slice(0, 8), 16);

  if (!matchedHub) {
    matchedHub = FALLBACK_AIRPORTS[hashNum % FALLBACK_AIRPORTS.length];
  }

  const primaryRunway = matchedHub.runways[0];
  const scenarioBucket = hashNum % 3;
  const distKm =
    scenarioBucket === 0
      ? 3.4 + (hashNum % 25) / 10
      : scenarioBucket === 1
        ? 9.2 + (hashNum % 40) / 10
        : 18.4 + (hashNum % 45) / 10;
  const angleOffset =
    scenarioBucket === 0
      ? 1.5 + (hashNum % 35) / 10
      : scenarioBucket === 1
        ? 4.0 + (hashNum % 55) / 10
        : 24 + (hashNum % 30);

  const approachBearingRad =
    (((primaryRunway.trueHdg + 180 + angleOffset) % 360) * Math.PI) / 180;
  const dLat = (distKm / 111.32) * Math.cos(approachBearingRad);
  const dLon =
    (distKm / (111.32 * Math.cos((matchedHub.lat * Math.PI) / 180))) *
    Math.sin(approachBearingRad);

  const synthLat = Math.round((matchedHub.lat + dLat) * 10000) / 10000;
  const synthLon = Math.round((matchedHub.lon + dLon) * 10000) / 10000;

  const shortId = `aud-${hashHex.slice(0, 8)}`;
  const spec: DemoFixtureSpec = {
    id: shortId,
    queryAddress: cleaned,
    formattedAddress: `${cleaned}, ${matchedHub.city} (${matchedHub.countryCode})`,
    neighborhoodLabel: cleaned.split(",")[0].trim().slice(0, 32),
    cityLabel: `${matchedHub.city}, ${matchedHub.countryCode}`,
    country: matchedHub.countryCode,
    countryCode: matchedHub.countryCode,
    postcode: "00000",
    lat: synthLat,
    lon: synthLon,
    timezone: "UTC",
    timezoneAbbr: "UTC",
    tzOffset: "+00:00",
    utcOffsetSeconds: 0,
    airport: {
      icao: matchedHub.icao,
      iata: matchedHub.iata,
      shortName: matchedHub.city,
      name: matchedHub.name,
      municipalityName: matchedHub.city,
      location: { lat: matchedHub.lat, lon: matchedHub.lon },
      countryCode: matchedHub.countryCode,
    },
    runways: matchedHub.runways.map((r) => ({
      name: r.name,
      trueHdg: r.trueHdg,
      length: {
        meter: r.lengthMeters,
        feet: Math.round(r.lengthMeters * 3.28084),
      },
      isClosed: false,
      surface: "Asphalt",
      hasLighting: true,
    })),
    dominantWindDeg: primaryRunway.trueHdg,
    dominantSharePct: 56 + (hashNum % 22),
    secondaryWindDeg: (primaryRunway.trueHdg + 180) % 360,
    meanSpeedKmh: 16 + (hashNum % 10),
    nightCount:
      scenarioBucket === 0 ? 18 + (hashNum % 14) : 7 + (hashNum % 10),
    dayCount: 64 + (hashNum % 35),
    primaryRunwayLabel: primaryRunway.name,
    airlines: [
      { name: "Commercial Carrier A", iata: "OM", aircraft: "Airbus A320neo" },
      { name: "Commercial Carrier B", iata: "VR", aircraft: "Boeing 737-800" },
    ],
    featuredBlurb: "",
    matchKeywords: [],
  };

  return {
    cacheHit: false,
    audit: buildAuditFromFixture(spec, shortId, cleaned),
  };
}
