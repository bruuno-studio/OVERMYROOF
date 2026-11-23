import { NextResponse } from "next/server";
import { isDemoMode, runAddressAudit } from "@/lib/airnodehub";
import {
  checkIpRateLimit,
  extractClientIp,
  getCachedAuditByGeohash,
  getCachedAuditByQuery,
  recordEvent,
  saveAudit,
} from "@/lib/storage";

const LIVE_RATE_LIMIT_PER_HOUR = 10;
const MAX_BODY_BYTES = 1024;

function sanitizeErrorForClient(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : "";
  if (raw.startsWith("Could not geocode")) {
    return { status: 422, message: raw };
  }
  if (raw.includes("Missing AIRNODEHUB_WALLET_PRIVATE_KEY")) {
    return {
      status: 503,
      message:
        "Live flight-path lookups are temporarily unavailable. Try inspecting one of the sample corridors below.",
    };
  }
  if (raw.includes("402") || raw.includes("exceeds maxCallUsd")) {
    return {
      status: 502,
      message:
        "Upstream aviation data settlement could not be completed right now. Please try again shortly.",
    };
  }
  return {
    status: 500,
    message: "Unable to complete the flight-path check right now. Please try again.",
  };
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request payload too large." },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }

    const rawText = await request.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request payload too large." },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }

    let body: { address?: unknown };
    try {
      body = JSON.parse(rawText) as { address?: unknown };
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const address =
      typeof body.address === "string"
        ? body.address.replace(/[\u0000-\u001F\u007F]/g, " ").trim()
        : "";

    if (address.length < 3 || address.length > 200) {
      return NextResponse.json(
        {
          error:
            "Enter a street address, neighborhood, or postcode between 3 and 200 characters.",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const demoMode = isDemoMode();
    const todayIso = new Date().toISOString().slice(0, 10);
    const clientIp = extractClientIp(request);

    // 1. Query-level daily cache check (zero paid calls, zero rate-limit burn)
    const cachedByQuery = await getCachedAuditByQuery(address, todayIso);
    if (cachedByQuery && (demoMode || cachedByQuery.mode === "LIVE")) {
      return NextResponse.json(
        {
          id: cachedByQuery.id,
          url: `/audit/${cachedByQuery.id}`,
          mode: cachedByQuery.mode,
          cached: true,
          audit: cachedByQuery,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "X-Overmyroof-Cache": "HIT-QUERY",
          },
        }
      );
    }

    // 2. Peek IP rate limit BEFORE spending x402 aUSD (does not burn quota if geohash cache hits!)
    let rateHeaders: Record<string, string> = {};
    if (!demoMode) {
      const peek = await checkIpRateLimit(
        clientIp,
        LIVE_RATE_LIMIT_PER_HOUR,
        false
      );
      rateHeaders = {
        "X-RateLimit-Limit": String(peek.limit),
        "X-RateLimit-Remaining": String(peek.remaining),
      };
      if (!peek.allowed) {
        return NextResponse.json(
          {
            error: `Live audit rate limit exceeded (${peek.limit} audits/hour per IP). Retry in ${Math.ceil(peek.resetSeconds / 60)} minutes or inspect any featured corridor.`,
          },
          {
            status: 429,
            headers: {
              ...rateHeaders,
              "Cache-Control": "no-store",
              "Retry-After": String(peek.resetSeconds),
            },
          }
        );
      }
    }

    // 3. Execute audit with ~200m geohash + date cache hook before paid calls
    const { audit, cacheHit } = await runAddressAudit(address, {
      lookupByGeohash: getCachedAuditByGeohash,
    });

    // Only consume an IP rate-limit token when a fresh (non-cached) live audit was executed
    if (!cacheHit && !demoMode) {
      const consumed = await checkIpRateLimit(
        clientIp,
        LIVE_RATE_LIMIT_PER_HOUR,
        true
      );
      rateHeaders = {
        "X-RateLimit-Limit": String(consumed.limit),
        "X-RateLimit-Remaining": String(consumed.remaining),
      };
    }

    if (!cacheHit) {
      await saveAudit(audit);
      await recordEvent({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: "audit_generated",
        auditId: audit.id,
        timestamp: new Date().toISOString(),
        meta: {
          mode: audit.mode,
          airport: audit.analysis.airportIata,
          verdict: audit.analysis.verdict,
          airnodeCalls: audit.attestations.length,
          costUsd: audit.totalCostUsd,
        },
      });
    }

    return NextResponse.json(
      {
        id: audit.id,
        url: `/audit/${audit.id}`,
        mode: audit.mode,
        cached: cacheHit,
        audit,
      },
      {
        status: 200,
        headers: {
          ...rateHeaders,
          "Cache-Control": "no-store",
          "X-Overmyroof-Cache": cacheHit ? "HIT-GEOHASH" : "MISS",
        },
      }
    );
  } catch (err) {
    const safe = sanitizeErrorForClient(err);
    return NextResponse.json(
      { error: safe.message },
      { status: safe.status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
