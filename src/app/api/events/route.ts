import { NextResponse } from "next/server";
import {
  checkScopedRateLimit,
  extractClientIp,
  getFunnelMetricsSnapshot,
  recordEvent,
} from "@/lib/storage";
import type { FunnelEventType } from "@/lib/types";

// Note: `audit_generated` is recorded exclusively server-side inside `/api/audit-address`
// so public clients cannot spoof audit counts.
const ALLOWED_PUBLIC_EVENTS = new Set<FunnelEventType>([
  "x_share_click",
  "png_download",
  "sim_play",
  "negotiation_copy",
  "mcp_config_copy",
  "signature_verify",
]);

const MAX_EVENT_BODY_BYTES = 2048;

function sanitizeMeta(
  raw: unknown
): Record<string, string | number | boolean> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const entries = Object.entries(raw as Record<string, unknown>).slice(0, 8);
  const clean: Record<string, string | number | boolean> = {};
  for (const [k, v] of entries) {
    const safeKey = k.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
    if (!safeKey) continue;
    if (typeof v === "string") clean[safeKey] = v.slice(0, 80);
    else if (typeof v === "number" && Number.isFinite(v)) clean[safeKey] = v;
    else if (typeof v === "boolean") clean[safeKey] = v;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

export async function GET() {
  const snapshot = await getFunnelMetricsSnapshot();
  return NextResponse.json(snapshot, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const clientIp = extractClientIp(request);
    const rl = await checkScopedRateLimit({
      scope: "events",
      clientIp,
      limit: 60,
      windowSeconds: 60,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many telemetry events." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(rl.resetSeconds),
          },
        }
      );
    }

    const rawText = await request.text();
    if (rawText.length > MAX_EVENT_BODY_BYTES) {
      return NextResponse.json(
        { error: "Event payload too large." },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }

    const body = JSON.parse(rawText) as {
      type?: unknown;
      auditId?: unknown;
      meta?: unknown;
    };

    if (
      typeof body.type !== "string" ||
      !ALLOWED_PUBLIC_EVENTS.has(body.type as FunnelEventType)
    ) {
      return NextResponse.json(
        { error: "Invalid funnel event type." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const event = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: body.type as FunnelEventType,
      auditId:
        typeof body.auditId === "string"
          ? body.auditId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || undefined
          : undefined,
      timestamp: new Date().toISOString(),
      meta: sanitizeMeta(body.meta),
    };

    await recordEvent(event);
    return NextResponse.json(
      { ok: true, id: event.id },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Malformed event payload." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
