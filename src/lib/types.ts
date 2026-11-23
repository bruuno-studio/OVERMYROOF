export type VerdictTier =
  | "LOW_FLYOVER_CORRIDOR"
  | "ACTIVE_APPROACH_CONE"
  | "CLEAR_AIRSPACE";

export type CorridorOperationType = "APPROACH" | "DEPARTURE" | "OFF_AXIS";

export interface AirnodeAttestationEnvelope {
  /** Airnode Ethereum address signing this response (from x-airnode.address) */
  airnode: string;
  /** keccak256(utf8(JSON.stringify([operation, canonical(parameters)]))) */
  requestHash: string;
  /** Unix timestamp in seconds as string */
  timestamp: string;
  /** Raw upstream JSON body exactly as received (string) */
  data: string;
  /** EIP-191 secp256k1 signature over keccak256(abi.encodePacked(requestHash, uint256(timestamp), utf8(data))) */
  signature: string;
}

export interface AirnodeCallRecord {
  provider: "geoapify" | "aerodatabox" | "open-meteo";
  endpoint: string;
  operation: string;
  parameters: Record<string, string | number | boolean>;
  priceUsd: number;
  mode: "DEMO" | "LIVE";
  attestation: AirnodeAttestationEnvelope;
  settlementTx?: string;
  settlementNetwork?: string;
  verifiedAtFetch?: boolean;
}

/** Geoapify /v1/geocode/search GeoJSON FeatureCollection response */
export interface GeoapifyGeocodeResponse {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      name?: string;
      country: string;
      country_code: string;
      state?: string;
      city?: string;
      postcode?: string;
      district?: string;
      suburb?: string;
      lon: number;
      lat: number;
      formatted: string;
      address_line1: string;
      address_line2?: string;
      result_type?: string;
      timezone?: {
        name: string;
        offset_STD: string;
        offset_DST?: string;
        offset_STD_seconds?: number;
        offset_DST_seconds?: number;
      };
    };
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
  }>;
  query: {
    text: string;
  };
}

/** AeroDataBox searchAirportsByLocation item */
export interface AeroDataBoxAirportItem {
  icao: string;
  iata: string;
  shortName: string;
  name: string;
  municipalityName: string;
  location: {
    lat: number;
    lon: number;
  };
  countryCode: string;
}

export interface AeroDataBoxSearchLocationResponse {
  searchBy: {
    lat: number;
    lon: number;
  };
  count: number;
  items: AeroDataBoxAirportItem[];
}

/** AeroDataBox airportRunways response item */
export interface AeroDataBoxRunwayItem {
  name: string;
  trueHdg: number;
  length?: {
    meter: number;
    feet: number;
  };
  width?: {
    meter: number;
    feet: number;
  };
  isClosed: boolean;
  surface?: string;
  hasLighting?: boolean | null;
}

/** AeroDataBox airportSchedule movement item */
export interface AeroDataBoxFlightMovement {
  number: string;
  status: string;
  airline?: {
    name: string;
    iata?: string;
  };
  aircraft?: {
    model: string;
  };
  movement: {
    airport?: {
      iata?: string;
      name?: string;
    };
    scheduledTime?: {
      utc: string;
      local: string;
    };
    revisedTime?: {
      utc: string;
      local: string;
    };
    runway?: string;
  };
}

export interface AeroDataBoxScheduleResponse {
  departures: AeroDataBoxFlightMovement[] | null;
  arrivals: AeroDataBoxFlightMovement[] | null;
}

/** Open-Meteo historicalWeather response */
export interface OpenMeteoHistoricalResponse {
  latitude: number;
  longitude: number;
  elevation: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  daily_units?: {
    time: string;
    wind_direction_10m_dominant: string;
    wind_speed_10m_max: string;
  };
  daily?: {
    time: string[];
    wind_direction_10m_dominant: number[];
    wind_speed_10m_max: number[];
  };
  hourly_units?: {
    time: string;
    wind_direction_10m: string;
    wind_speed_10m: string;
  };
  hourly?: {
    time: string[];
    wind_direction_10m: number[];
    wind_speed_10m: number[];
  };
}

export interface CorridorAnalysis {
  airportIata: string;
  airportIcao: string;
  airportName: string;
  airportLat: number;
  airportLon: number;
  distanceKm: number;
  bearingFromAirportDeg: number;
  runwayName: string;
  runwayTrueHdg: number;
  corridorType: CorridorOperationType;
  angleOffsetDeg: number;
  insideCone: boolean;
  altitudeMeters: number;
  altitudeFeet: number;
  activeWindPct: number;
  prevailingWindDeg: number;
  prevailingWindLabel: string;
  meanWindSpeedKmh: number;
  nightFlights: number;
  totalDailyMovements: number;
  estimatedDb: number;
  verdict: VerdictTier;
  verdictHeadline: string;
  verdictSubline: string;
  runwaySource: "AERODATABOX" | "FALLBACK_TABLE";
  /** True when AeroDataBox found zero commercial airports within 25 km (skipped paid wind call). */
  noNearbyAirport?: boolean;
}

export interface AuditRecord {
  id: string;
  slug?: string;
  createdAt: string;
  mode: "DEMO" | "LIVE";
  queryAddress: string;
  formattedAddress: string;
  neighborhoodLabel: string;
  cityLabel: string;
  countryCode: string;
  lat: number;
  lon: number;
  geohash: string;
  analysis: CorridorAnalysis;
  attestations: AirnodeCallRecord[];
  combinedProofHash: string;
  totalCostUsd: number;
  featured?: boolean;
  featuredBlurb?: string;
}

export type FunnelEventType =
  | "audit_generated"
  | "x_share_click"
  | "png_download"
  | "sim_play"
  | "negotiation_copy"
  | "mcp_config_copy"
  | "signature_verify";

export interface FunnelEvent {
  id: string;
  type: FunnelEventType;
  auditId?: string;
  timestamp: string;
  meta?: Record<string, string | number | boolean>;
}
