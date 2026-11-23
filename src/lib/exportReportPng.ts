import {
  computeLateralDistanceKm,
  describeNoiseLevel,
  estimateIndoorDb,
  formatPlainWindLabel,
  getHumanVerdict,
} from "@/lib/humanCopy";
import type { AuditRecord } from "@/lib/types";

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function polarPoint(
  cx: number,
  cy: number,
  bearingDeg: number,
  radiusPx: number
): { x: number; y: number } {
  const rad = ((bearingDeg - 90) * Math.PI) / 180;
  return {
    x: cx + Math.cos(rad) * radiusPx,
    y: cy + Math.sin(rad) * radiusPx,
  };
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 4 && ctx.measureText(`${out}...`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

/**
 * Renders a razor-sharp 1200x630 custom OverMyRoof Report PNG directly in the browser.
 * Uses 0 ms of Cloudflare Worker CPU (100% Cloudflare Workers Free Plan safe).
 */
export async function downloadAuditReportPng(audit: AuditRecord): Promise<void> {
  const scale = 2; // 2400x1260 retina export scaled down cleanly or crisp 1200x630
  const W = 1200;
  const H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.scale(scale, scale);

  const { analysis } = audit;
  const verdict = getHumanVerdict(analysis.verdict, analysis.insideCone, {
    nightFlights: analysis.nightFlights,
    totalDailyMovements: analysis.totalDailyMovements,
  });
  const noiseAnalogy = describeNoiseLevel(analysis.estimatedDb);
  const indoorDb = estimateIndoorDb(analysis.estimatedDb);
  const windPhrase = formatPlainWindLabel(analysis.prevailingWindLabel);
  const lateralKm = computeLateralDistanceKm(
    analysis.distanceKm,
    analysis.angleOffsetDeg
  );

  const bannerBg =
    analysis.verdict === "LOW_FLYOVER_CORRIDOR"
      ? "#FEF2F2"
      : analysis.verdict === "ACTIVE_APPROACH_CONE"
        ? "#FFFBEB"
        : "#F0FDF4";
  const bannerBorder =
    analysis.verdict === "LOW_FLYOVER_CORRIDOR"
      ? "#FECACA"
      : analysis.verdict === "ACTIVE_APPROACH_CONE"
        ? "#FDE68A"
        : "#BBF7D0";
  const pillBg =
    analysis.verdict === "LOW_FLYOVER_CORRIDOR"
      ? "#FEE2E2"
      : analysis.verdict === "ACTIVE_APPROACH_CONE"
        ? "#FEF3C7"
        : "#DCFCE7";
  const pillText =
    analysis.verdict === "LOW_FLYOVER_CORRIDOR"
      ? "#B91C1C"
      : analysis.verdict === "ACTIVE_APPROACH_CONE"
        ? "#B45309"
        : "#15803D";

  const sans = '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  const mono = '"JetBrains Mono", ui-monospace, monospace';

  // Background
  ctx.fillStyle = "#FAF9F7";
  ctx.fillRect(0, 0, W, H);

  // Outer card clip
  ctx.save();
  drawRoundedRect(ctx, 28, 28, W - 56, H - 56, 26);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.clip();

  // Top Verdict Banner
  ctx.fillStyle = bannerBg;
  ctx.fillRect(28, 28, W - 56, 152);
  ctx.strokeStyle = bannerBorder;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(28, 180);
  ctx.lineTo(W - 28, 180);
  ctx.stroke();

  // Badge pill
  const pillLabel = `${verdict.badgeLabel} · ${verdict.sleepImpact}`;
  ctx.font = `700 14px ${sans}`;
  const pillW = ctx.measureText(pillLabel).width + 28;
  drawRoundedRect(ctx, 60, 52, pillW, 30, 15);
  ctx.fillStyle = pillBg;
  ctx.fill();
  ctx.fillStyle = pillText;
  ctx.fillText(pillLabel, 74, 72);

  // Brand top-right
  ctx.font = `800 19px ${sans}`;
  ctx.fillStyle = "#18181B";
  ctx.textAlign = "right";
  ctx.fillText("OverMyRoof", W - 60, 73);
  ctx.textAlign = "left";

  // Headline + address
  ctx.font = `800 34px ${sans}`;
  ctx.fillStyle = "#18181B";
  ctx.fillText(truncateText(ctx, verdict.title, W - 130), 60, 126);

  ctx.font = `500 18px ${sans}`;
  ctx.fillStyle = "#3F3F46";
  ctx.fillText(truncateText(ctx, audit.formattedAddress, W - 130), 60, 158);

  // 4 Stat Cards (2x2 on left)
  const cards = [
    {
      x: 60,
      y: 204,
      label: "Peak Flyover Noise",
      value: `~${analysis.estimatedDb} dB (~${indoorDb} dB in)`,
      valueColor: verdict.accentHex,
      sub: noiseAnalogy,
    },
    {
      x: 406,
      y: 204,
      label: "Airport Night Flights (11 PM–6 AM)",
      value: analysis.noNearbyAirport
        ? "None nearby"
        : `${analysis.nightFlights} flights`,
      valueColor: "#18181B",
      sub: analysis.noNearbyAirport
        ? "No commercial airport within 25 km"
        : `${analysis.airportIata} · ${analysis.distanceKm.toFixed(1)} km away`,
    },
    {
      x: 60,
      y: 368,
      label: analysis.insideCone
        ? "Plane Height Overhead"
        : "Position vs. Flight Path",
      value: analysis.insideCone
        ? `~${analysis.altitudeFeet.toLocaleString()} ft (${analysis.altitudeMeters} m)`
        : `~${lateralKm.toFixed(1)} km off path`,
      valueColor: "#18181B",
      sub: `Runway ${analysis.runwayName} (${analysis.angleOffsetDeg.toFixed(1)}° off center)`,
    },
    {
      x: 406,
      y: 368,
      label: "Active Wind Days",
      value: `${analysis.activeWindPct}% of the year`,
      valueColor: "#18181B",
      sub: `Mostly ${windPhrase}`,
    },
  ];

  for (const c of cards) {
    drawRoundedRect(ctx, c.x, c.y, 330, 148, 16);
    ctx.fillStyle = "#FAF9F7";
    ctx.fill();
    ctx.strokeStyle = "#E7E5E4";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = `500 13px ${sans}`;
    ctx.fillStyle = "#71717A";
    ctx.fillText(c.label, c.x + 20, c.y + 38);

    ctx.font = `800 28px ${sans}`;
    ctx.fillStyle = c.valueColor;
    ctx.fillText(truncateText(ctx, c.value, 290), c.x + 20, c.y + 84);

    ctx.font = `400 13px ${sans}`;
    ctx.fillStyle = "#52525B";
    ctx.fillText(truncateText(ctx, c.sub, 290), c.x + 20, c.y + 116);
  }

  // Right Panel: True North-Up Compass Map
  drawRoundedRect(ctx, 760, 204, 380, 312, 18);
  ctx.fillStyle = "#F8FAFC";
  ctx.fill();
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `700 13px ${sans}`;
  ctx.fillStyle = "#3F3F46";
  ctx.fillText(`${analysis.airportIata} Runway ${analysis.runwayName}`, 780, 232);
  ctx.textAlign = "right";
  ctx.fillStyle = "#71717A";
  ctx.fillText("True North ↑", 1120, 232);
  ctx.textAlign = "left";

  // Inner map box
  drawRoundedRect(ctx, 778, 246, 344, 224, 12);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  ctx.stroke();

  const cx = 950;
  const cy = 358;
  const maxKm = Math.max(16, Math.min(24, analysis.distanceKm * 1.15));
  const pxPerKm = 94 / maxKm;

  // Rings
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#E2E8F0";
  ctx.beginPath();
  ctx.arc(cx, cy, 8 * pxPerKm, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#CBD5E1";
  ctx.beginPath();
  ctx.arc(cx, cy, 16 * pxPerKm, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const approachBearing = (analysis.runwayTrueHdg + 180) % 360;
  const departureBearing = analysis.runwayTrueHdg;
  const primaryBearing =
    analysis.corridorType === "DEPARTURE" ? departureBearing : approachBearing;
  const secondaryBearing =
    analysis.corridorType === "DEPARTURE" ? approachBearing : departureBearing;

  // Secondary cone
  const secL = polarPoint(cx, cy, secondaryBearing - 12, 12 * pxPerKm);
  const secR = polarPoint(cx, cy, secondaryBearing + 12, 12 * pxPerKm);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(secL.x, secL.y);
  ctx.lineTo(secR.x, secR.y);
  ctx.closePath();
  ctx.fillStyle = "rgba(2, 132, 199, 0.10)";
  ctx.fill();

  // Primary outer cone
  const priL = polarPoint(cx, cy, primaryBearing - 12, 16 * pxPerKm);
  const priR = polarPoint(cx, cy, primaryBearing + 12, 16 * pxPerKm);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(priL.x, priL.y);
  ctx.lineTo(priR.x, priR.y);
  ctx.closePath();
  ctx.fillStyle = `${verdict.accentHex}24`;
  ctx.fill();
  ctx.strokeStyle = `${verdict.accentHex}99`;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Primary inner cone
  const inL = polarPoint(cx, cy, primaryBearing - 12, 8 * pxPerKm);
  const inR = polarPoint(cx, cy, primaryBearing + 12, 8 * pxPerKm);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(inL.x, inL.y);
  ctx.lineTo(inR.x, inR.y);
  ctx.closePath();
  ctx.fillStyle = `${verdict.accentHex}38`;
  ctx.fill();

  // Runway bar
  const rwyA = polarPoint(cx, cy, departureBearing, 18);
  const rwyB = polarPoint(cx, cy, approachBearing, 18);
  ctx.strokeStyle = "#0F172A";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(rwyA.x, rwyA.y);
  ctx.lineTo(rwyB.x, rwyB.y);
  ctx.stroke();

  // Vector to stay
  const stayRadius = Math.max(20, Math.min(94, analysis.distanceKm * pxPerKm));
  const stayPt = polarPoint(cx, cy, analysis.bearingFromAirportDeg, stayRadius);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(15, 23, 42, 0.5)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(stayPt.x, stayPt.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Stay pin
  ctx.beginPath();
  ctx.arc(stayPt.x, stayPt.y, 13, 0, Math.PI * 2);
  ctx.fillStyle = `${verdict.accentHex}33`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(stayPt.x, stayPt.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = verdict.accentHex;
  ctx.fill();
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Map footer caption
  ctx.font = `500 12px ${sans}`;
  ctx.fillStyle = "#52525B";
  ctx.fillText(`Distance: ${analysis.distanceKm.toFixed(1)} km`, 780, 496);
  ctx.textAlign = "right";
  ctx.fillText(
    analysis.insideCone
      ? `~${analysis.altitudeFeet.toLocaleString()} ft up`
      : `${analysis.angleOffsetDeg.toFixed(0)}° off path`,
    1120,
    496
  );
  ctx.textAlign = "left";

  // Bottom Verified Footer Strip
  ctx.fillStyle = "#FAF9F7";
  ctx.fillRect(28, 540, W - 56, 62);
  ctx.strokeStyle = "#E7E5E4";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(28, 540);
  ctx.lineTo(W - 28, 540);
  ctx.stroke();

  const isLive = audit.mode === "LIVE";
  drawRoundedRect(ctx, 60, 557, isLive ? 214 : 240, 28, 14);
  ctx.fillStyle = isLive ? "#DCFCE7" : "#FEF3C7";
  ctx.fill();
  ctx.font = `700 12px ${sans}`;
  ctx.fillStyle = isLive ? "#15803D" : "#B45309";
  ctx.fillText(
    isLive ? "Signed via API3 AirnodeHub" : "Sample Preview · AirnodeHub Schema",
    76,
    575
  );

  ctx.font = `400 12px ${mono}`;
  ctx.fillStyle = "#52525B";
  ctx.fillText(
    isLive
      ? `Proof ${audit.combinedProofHash.slice(0, 18)}... · Overhead commercial aviation only`
      : `Sample report · Overhead commercial aviation only`,
    isLive ? 288 : 314,
    575
  );

  ctx.textAlign = "right";
  ctx.fillStyle = "#71717A";
  ctx.fillText(`${audit.createdAt.slice(0, 10)} UTC`, W - 60, 575);
  ctx.textAlign = "left";

  ctx.restore();

  // Outer card border
  drawRoundedRect(ctx, 28, 28, W - 56, H - 56, 26);
  ctx.strokeStyle = "#E7E5E4";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Trigger instant download
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new Error("Failed to encode PNG");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `overmyroof-${audit.id}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
