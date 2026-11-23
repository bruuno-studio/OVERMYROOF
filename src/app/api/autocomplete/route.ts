import { NextResponse } from "next/server";
import { AIRNODEHUB_CATALOG } from "@/lib/catalog";
import { checkScopedRateLimit, extractClientIp } from "@/lib/storage";
import type { AirnodeAttestationEnvelope, GeoapifyGeocodeResponse } from "@/lib/types";

export interface AutocompleteSuggestion {
  label: string;
  primary: string;
  secondary: string;
  lat: number;
  lon: number;
  countryCode: string;
  resultType: string;
}

const CACHE_TTL_MS = 1000 * 60 * 10;
const autocompleteCache = new Map<
  string,
  { expiresAt: number; suggestions: AutocompleteSuggestion[] }
>();

function formatResultType(raw?: string): string {
  switch (raw) {
    case "suburb":
    case "district":
      return "Neighborhood";
    case "street":
    case "building":
      return "Street";
    case "city":
    case "county":
    case "state":
      return "City";
    case "postcode":
      return "Postcode";
    case "amenity":
      return "Place";
    default:
      return "Area";
  }
}

/**
 * Live global address & neighborhood autocomplete powered by API3 AirnodeHub Geoapify.
 * Geoapify `autocomplete` is FREE ($0.00 aUSD) on AirnodeHub and covers worldwide streets,
 * neighborhoods, hotels, and cities (including all of Turkey and Eskisehir).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = (searchParams.get("q") || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();

  if (rawQuery.length < 2 || rawQuery.length > 140) {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }

  const cacheKey = rawQuery.toLowerCase();
  const cached = autocompleteCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(
      { suggestions: cached.suggestions },
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=120" },
      }
    );
  }

  const rl = await checkScopedRateLimit({
    scope: "autocomplete",
    clientIp: extractClientIp(request),
    limit: 60,
    windowSeconds: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { suggestions: [] },
      { status: 429, headers: { "Retry-After": String(rl.resetSeconds) } }
    );
  }

  try {
    const res = await fetch(`${AIRNODEHUB_CATALOG.providers.geoapify.baseUrl}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "autocomplete",
        parameters: {
          text: rawQuery,
          limit: 6,
          bias: "countrycode:none",
        },
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ suggestions: [] }, { status: 200 });
    }

    const envelope = (await res.json()) as AirnodeAttestationEnvelope;
    const parsed = JSON.parse(envelope.data) as GeoapifyGeocodeResponse;
    const seen = new Set<string>();
    const suggestions: AutocompleteSuggestion[] = [];

    for (const feature of parsed.features || []) {
      const p = feature.properties;
      const formatted = (p.formatted || "").trim();
      if (!formatted || seen.has(formatted.toLowerCase())) continue;
      seen.add(formatted.toLowerCase());

      const primary =
        p.address_line1 ||
        p.name ||
        p.suburb ||
        formatted.split(",")[0].trim();
      const secondary =
        p.address_line2 ||
        [p.suburb, p.city, p.country]
          .filter((v) => v && v !== primary)
          .join(", ");

      suggestions.push({
        label: formatted,
        primary,
        secondary,
        lat: p.lat,
        lon: p.lon,
        countryCode: (p.country_code || "").toUpperCase(),
        resultType: formatResultType(p.result_type),
      });
    }

    if (autocompleteCache.size > 300) {
      autocompleteCache.clear();
    }
    autocompleteCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      suggestions,
    });

    return NextResponse.json(
      { suggestions },
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=120" },
      }
    );
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
}
