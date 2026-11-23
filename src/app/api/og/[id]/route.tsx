import { env } from "cloudflare:workers";
import {
  computeLateralDistanceKm,
  describeNoiseLevel,
  estimateIndoorDb,
  formatPlainWindLabel,
  getHumanVerdict,
} from "@/lib/humanCopy";
import { getAuditById } from "@/lib/storage";
import type { AuditRecord } from "@/lib/types";

interface AssetsFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

const STATIC_FEATURED_OG = new Set([
  "lhr-hounslow",
  "lax-el-segundo",
  "saw-pendik",
  "lga-astoria",
  "ldn-hampstead",
]);

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildDynamicSvgSlip(audit: AuditRecord): string {
  const { analysis } = audit;
  const verdict = getHumanVerdict(analysis.verdict, analysis.insideCone, {
    nightFlights: analysis.nightFlights,
    totalDailyMovements: analysis.totalDailyMovements,
  });
  const lateralKm = computeLateralDistanceKm(
    analysis.distanceKm,
    analysis.angleOffsetDeg
  );
  const noiseAnalogy = describeNoiseLevel(analysis.estimatedDb);
  const indoorDb = estimateIndoorDb(analysis.estimatedDb);
  const windPhrase = formatPlainWindLabel(analysis.prevailingWindLabel);
  const bannerBg =
    analysis.verdict === "LOW_FLYOVER_CORRIDOR"
      ? "#FEF2F2"
      : analysis.verdict === "ACTIVE_APPROACH_CONE"
        ? "#FFFBEB"
        : "#F0FDF4";
  const isLive = audit.mode === "LIVE";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#FAF9F7"/>
  <rect x="28" y="28" width="1144" height="574" rx="26" fill="#FFFFFF" stroke="#E7E5E4" stroke-width="2"/>
  <rect x="28" y="28" width="1144" height="150" rx="26" fill="${bannerBg}"/>
  <text x="64" y="76" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="${verdict.accentHex}">${escapeXml(verdict.badgeLabel)} · ${escapeXml(verdict.sleepImpact)}</text>
  <text x="1136" y="76" text-anchor="end" font-family="system-ui,sans-serif" font-size="20" font-weight="800" fill="#18181B">OverMyRoof</text>
  <text x="64" y="124" font-family="system-ui,sans-serif" font-size="34" font-weight="800" fill="#18181B">${escapeXml(verdict.title)}</text>
  <text x="64" y="156" font-family="system-ui,sans-serif" font-size="18" fill="#3F3F46">${escapeXml(audit.formattedAddress.slice(0, 82))}</text>
  <rect x="64" y="206" width="520" height="146" rx="16" fill="#FAF9F7" stroke="#E7E5E4"/>
  <text x="88" y="242" font-family="system-ui,sans-serif" font-size="14" fill="#71717A">Peak Flyover Noise</text>
  <text x="88" y="290" font-family="system-ui,sans-serif" font-size="34" font-weight="800" fill="${verdict.accentHex}">~${analysis.estimatedDb} dB (~${indoorDb} dB in)</text>
  <text x="88" y="324" font-family="system-ui,sans-serif" font-size="14" fill="#52525B">${escapeXml(noiseAnalogy)}</text>
  <rect x="616" y="206" width="520" height="146" rx="16" fill="#FAF9F7" stroke="#E7E5E4"/>
  <text x="640" y="242" font-family="system-ui,sans-serif" font-size="14" fill="#71717A">Airport Night Flights (11 PM–6 AM)</text>
  <text x="640" y="290" font-family="system-ui,sans-serif" font-size="34" font-weight="800" fill="#18181B">${analysis.noNearbyAirport ? "None nearby" : `${analysis.nightFlights} flights`}</text>
  <text x="640" y="324" font-family="system-ui,sans-serif" font-size="14" fill="#52525B">${analysis.noNearbyAirport ? "No commercial airport within 25 km" : `${escapeXml(analysis.airportIata)} · ${analysis.distanceKm.toFixed(1)} km away (airport-wide)`}</text>
  <rect x="64" y="372" width="520" height="146" rx="16" fill="#FAF9F7" stroke="#E7E5E4"/>
  <text x="88" y="408" font-family="system-ui,sans-serif" font-size="14" fill="#71717A">${analysis.insideCone ? "Plane Height Overhead" : "Position vs. Flight Path"}</text>
  <text x="88" y="456" font-family="system-ui,sans-serif" font-size="30" font-weight="800" fill="#18181B">${analysis.insideCone ? `~${analysis.altitudeFeet.toLocaleString()} ft (${analysis.altitudeMeters} m)` : `~${lateralKm.toFixed(1)} km off path`}</text>
  <text x="88" y="490" font-family="system-ui,sans-serif" font-size="14" fill="#52525B">Runway ${escapeXml(analysis.runwayName)} (${analysis.angleOffsetDeg.toFixed(1)}° off center)</text>
  <rect x="616" y="372" width="520" height="146" rx="16" fill="#FAF9F7" stroke="#E7E5E4"/>
  <text x="640" y="408" font-family="system-ui,sans-serif" font-size="14" fill="#71717A">Active Wind Days</text>
  <text x="640" y="456" font-family="system-ui,sans-serif" font-size="30" font-weight="800" fill="#18181B">${analysis.noNearbyAirport ? "Not exposed" : `${analysis.activeWindPct}% of the year`}</text>
  <text x="640" y="490" font-family="system-ui,sans-serif" font-size="14" fill="#52525B">${analysis.noNearbyAirport ? "Outside 25 km runway range" : `Mostly ${escapeXml(windPhrase)}`}</text>
  <text x="64" y="576" font-family="monospace" font-size="13" fill="${isLive ? "#15803D" : "#B45309"}">${isLive ? `Signed via API3 AirnodeHub · Proof ${escapeXml(audit.combinedProofHash.slice(0, 20))}...` : "Sample Preview · AirnodeHub Schema · Search any address for live signed proof"}</text>
  <text x="1136" y="576" text-anchor="end" font-family="monospace" font-size="13" fill="#71717A">${escapeXml(audit.createdAt.slice(0, 10))} UTC</text>
</svg>`;
}

/**
 * Cloudflare Workers Free-Tier Safe OG Endpoint (< 1 ms CPU, zero WASM).
 * - Serves crisp pre-rendered 1200x630 PNG from Cloudflare Static ASSETS (no 10ms CPU limit risk).
 * - Supports `?format=svg` for exact instant dynamic vector report rendering (< 1 ms CPU).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const audit = await getAuditById(id);

  if (!audit) {
    return new Response("Flight-path report not found", { status: 404 });
  }

  const reqUrl = new URL(request.url);
  if (reqUrl.searchParams.get("format") === "svg") {
    return new Response(buildDynamicSvgSlip(audit), {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const staticFilename = STATIC_FEATURED_OG.has(audit.id)
    ? `${audit.id}.png`
    : audit.analysis.verdict === "LOW_FLYOVER_CORRIDOR"
      ? "tier-loud.png"
      : audit.analysis.verdict === "ACTIVE_APPROACH_CONE"
        ? "tier-moderate.png"
        : "tier-clear.png";

  const assetUrl = new URL(`/og/${staticFilename}`, reqUrl.origin);
  const isDownload = reqUrl.searchParams.get("download") === "1";

  try {
    const assets = (env as unknown as { ASSETS?: AssetsFetcher })?.ASSETS;
    if (assets && typeof assets.fetch === "function") {
      const res = await assets.fetch(new Request(assetUrl));
      if (res.ok) {
        const headers = new Headers({
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        });
        if (isDownload) {
          headers.set(
            "Content-Disposition",
            `attachment; filename="overmyroof-${audit.id}.png"`
          );
        }
        return new Response(res.body, { status: 200, headers });
      }
    }
  } catch {
    // Fallback redirect
  }

  return Response.redirect(assetUrl.toString(), 302);
}
