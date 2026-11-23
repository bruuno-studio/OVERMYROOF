/**
 * Verified live AirnodeHub catalog metadata inspected directly from
 * https://airnodehub.api3.org/llms.txt and each listing's GET / OpenAPI spec.
 * Client- and server-safe (no Node or Cloudflare server-only imports).
 */
export const AIRNODEHUB_CATALOG = {
  mcpUrl: "https://airnodehub.api3.org/mcp",
  resolveUrl: "https://airnodehub.api3.org/resolve",
  payment: {
    x402Version: 2,
    scheme: "exact" as const,
    network: "eip155:84532",
    asset: "0xbeA34973e5f67F18F656A2C6070C64326C791808",
    symbol: "aUSD",
    decimals: 6,
    payTo: "0x1505FD562AC2Fb4307B85BC6c672FfeafB4d57A7",
    facilitator: "https://facilitator.payai.network",
  },
  providers: {
    geoapify: {
      baseUrl: "https://airnodes.api3.org/geoapify",
      passthroughUrl: "https://airnodes.api3.org/geoapify/api",
      address: "0xe02BEaC10Add5037daa0FF6BCACB13360bd4185D",
      operations: {
        geocode: { priceUsd: 0 },
        autocomplete: { priceUsd: 0 },
      },
    },
    aerodatabox: {
      baseUrl: "https://airnodes.api3.org/aerodatabox",
      passthroughUrl: "https://airnodes.api3.org/aerodatabox/api",
      address: "0x83FE2E8F24E66520B1902C3507De4F471248f2Ec",
      operations: {
        searchAirportsByLocation: { priceUsd: 0.05 },
        airportRunways: { priceUsd: 0.02 },
        airportSchedule: { priceUsd: 0.05 },
        airport: { priceUsd: 0.02 },
      },
    },
    openMeteo: {
      baseUrl: "https://airnodes.api3.org/open-meteo",
      passthroughUrl: "https://airnodes.api3.org/open-meteo/api",
      address: "0xee510FFb986299529fE987bfD163D6c89067D767",
      operations: {
        historicalWeather: { priceUsd: 0.1 },
        forecast: { priceUsd: 0.02 },
      },
    },
    visualCrossing: {
      baseUrl: "https://airnodes.api3.org/visualcrossing",
      passthroughUrl: "https://airnodes.api3.org/visualcrossing/api",
      address: "0xc86c050c80474c9756437Ee2026FfF093f20f479",
      operations: {
        getForecast: { priceUsd: 0.02 },
        getTimelinePeriod: { priceUsd: 0.5 },
        getTimelineRange: { priceUsd: 0.5 },
      },
    },
  },
} as const;
