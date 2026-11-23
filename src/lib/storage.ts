import { env as cfEnv } from "cloudflare:workers";
import { getFeaturedDemoAudits } from "@/lib/airnodehub";
import type { AuditRecord, FunnelEvent, FunnelEventType } from "@/lib/types";

/**
 * Edge-safe persistence abstraction supporting:
 * 1. Cloudflare Workers KV (`OVERMYROOF_KV` binding)
 * 2. Optional Upstash Redis REST (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`)
 * 3. In-memory isolate store (local dev & instant read-through cache)
 * Zero local filesystem writes.
 */
interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>;
}

const AUDIT_PREFIX = "audit:";
const GEOHASH_PREFIX = "geohash:";
const QUERY_PREFIX = "query:";
const RATE_PREFIX = "rl:";
const EVENTS_KEY = "events:recent";
const RECENT_AUDITS_KEY = "audits:recent";

const SAFE_AUDIT_ID_RE = /^[a-z0-9][a-z0-9_-]{1,62}$/i;

interface GlobalStoreState {
  audits: Map<string, AuditRecord>;
  geohashIndex: Map<string, string>;
  queryIndex: Map<string, string>;
  rateLimits: Map<string, number>;
  events: FunnelEvent[];
  recentHydrated: boolean;
  seeded: boolean;
}

const globalForStore = globalThis as unknown as {
  __OVERMYROOF_STORE__?: GlobalStoreState;
};

function getMemoryStore(): GlobalStoreState {
  if (!globalForStore.__OVERMYROOF_STORE__) {
    globalForStore.__OVERMYROOF_STORE__ = {
      audits: new Map<string, AuditRecord>(),
      geohashIndex: new Map<string, string>(),
      queryIndex: new Map<string, string>(),
      rateLimits: new Map<string, number>(),
      events: [],
      recentHydrated: false,
      seeded: false,
    };
  }
  const store = globalForStore.__OVERMYROOF_STORE__;
  // Always keep featured sample audits in sync (handles Vite HMR fixture updates without dev restart)
  const featured = getFeaturedDemoAudits();
  const featuredIds = new Set(featured.map((a) => a.id));
  for (const [id, existing] of store.audits.entries()) {
    if (existing.featured && !featuredIds.has(id)) {
      store.audits.delete(id);
    }
  }
  for (const audit of featured) {
    store.audits.set(audit.id, audit);
  }
  store.seeded = true;
  return store;
}

function getOptionalKv(): KvNamespaceLike | null {
  try {
    const binding = (cfEnv as Record<string, unknown> | undefined)
      ?.OVERMYROOF_KV as KvNamespaceLike | undefined;
    if (binding && typeof binding.get === "function") return binding;
  } catch {
    // Outside Cloudflare runtime
  }
  const maybeGlobal = globalThis as unknown as {
    OVERMYROOF_KV?: KvNamespaceLike;
  };
  return maybeGlobal.OVERMYROOF_KV ?? null;
}

function getUpstashConfig(): { url: string; token: string } | null {
  let url: string | undefined;
  let token: string | undefined;
  try {
    const rec = cfEnv as Record<string, unknown> | undefined;
    if (typeof rec?.UPSTASH_REDIS_REST_URL === "string") {
      url = rec.UPSTASH_REDIS_REST_URL;
    }
    if (typeof rec?.UPSTASH_REDIS_REST_TOKEN === "string") {
      token = rec.UPSTASH_REDIS_REST_TOKEN;
    }
  } catch {
    // Fallback
  }
  url = url || process.env?.UPSTASH_REDIS_REST_URL;
  token = token || process.env?.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url: url.replace(/\/$/, ""), token };
  return null;
}

async function kvOrRedisGet(key: string): Promise<string | null> {
  const kv = getOptionalKv();
  if (kv) {
    try {
      return await kv.get(key);
    } catch {
      return null;
    }
  }
  const upstash = getUpstashConfig();
  if (upstash) {
    try {
      const res = await fetch(
        `${upstash.url}/get/${encodeURIComponent(key)}`,
        {
          headers: { Authorization: `Bearer ${upstash.token}` },
        }
      );
      if (res.ok) {
        const body = (await res.json()) as { result: string | null };
        return body.result;
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function kvOrRedisSet(
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<void> {
  const kv = getOptionalKv();
  if (kv) {
    try {
      await kv.put(
        key,
        value,
        ttlSeconds ? { expirationTtl: ttlSeconds } : undefined
      );
    } catch {
      // Non-fatal fallback to memory store
    }
    return;
  }
  const upstash = getUpstashConfig();
  if (upstash) {
    try {
      const endpoint = ttlSeconds
        ? `${upstash.url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}/EX/${ttlSeconds}`
        : `${upstash.url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
      await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${upstash.token}` },
      });
    } catch {
      // Non-fatal fallback to memory store
    }
  }
}

/** Unicode/Turkish-safe ASCII query key normalizer (prevents "Eskişehir" -> "eski-ehir" collisions). */
export function normalizeQueryKey(rawAddress: string): string {
  return rawAddress
    .trim()
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function getAuditById(id: string): Promise<AuditRecord | null> {
  const normalized = id.trim();
  if (!SAFE_AUDIT_ID_RE.test(normalized)) {
    return null;
  }
  const store = getMemoryStore();

  const fromMem = store.audits.get(normalized);
  if (fromMem) return fromMem;

  const raw = await kvOrRedisGet(`${AUDIT_PREFIX}${normalized}`);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AuditRecord;
      store.audits.set(normalized, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  return null;
}

export async function getCachedAuditByQuery(
  rawAddress: string,
  dateIso?: string
): Promise<AuditRecord | null> {
  const day = dateIso || new Date().toISOString().slice(0, 10);
  const key = `${normalizeQueryKey(rawAddress)}:${day}`;
  const store = getMemoryStore();

  const memId = store.queryIndex.get(key);
  if (memId) {
    const hit = await getAuditById(memId);
    if (hit) return hit;
  }

  const remoteId = await kvOrRedisGet(`${QUERY_PREFIX}${key}`);
  if (remoteId) {
    store.queryIndex.set(key, remoteId);
    return await getAuditById(remoteId);
  }
  return null;
}

export async function getCachedAuditByGeohash(
  geohash: string,
  dateIso?: string
): Promise<AuditRecord | null> {
  const day = dateIso || new Date().toISOString().slice(0, 10);
  const key = `${geohash}:${day}`;
  const store = getMemoryStore();

  const memId = store.geohashIndex.get(key);
  if (memId) {
    const hit = await getAuditById(memId);
    if (hit) return hit;
  }

  const remoteId = await kvOrRedisGet(`${GEOHASH_PREFIX}${key}`);
  if (remoteId) {
    store.geohashIndex.set(key, remoteId);
    return await getAuditById(remoteId);
  }
  return null;
}

export async function saveAudit(audit: AuditRecord): Promise<void> {
  const store = getMemoryStore();
  store.audits.set(audit.id, audit);

  const dateKey = audit.createdAt.slice(0, 10);
  const geohashKey = `${audit.geohash}:${dateKey}`;
  const queryKey = `${normalizeQueryKey(audit.queryAddress)}:${dateKey}`;

  store.geohashIndex.set(geohashKey, audit.id);
  store.queryIndex.set(queryKey, audit.id);

  // Maintain persistent recent audit IDs index in KV/Redis so /metrics survives Worker cold starts
  const recentIdsPromise = (async () => {
    const existingRaw = await kvOrRedisGet(RECENT_AUDITS_KEY);
    let ids: string[] = [];
    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw);
        if (Array.isArray(parsed)) {
          ids = parsed.filter((x): x is string => typeof x === "string");
        }
      } catch {
        ids = [];
      }
    }
    const nextIds = [audit.id, ...ids.filter((id) => id !== audit.id)].slice(
      0,
      100
    );
    await kvOrRedisSet(
      RECENT_AUDITS_KEY,
      JSON.stringify(nextIds),
      60 * 60 * 24 * 30
    );
  })();

  await Promise.all([
    kvOrRedisSet(
      `${AUDIT_PREFIX}${audit.id}`,
      JSON.stringify(audit),
      60 * 60 * 24 * 30
    ),
    kvOrRedisSet(`${GEOHASH_PREFIX}${geohashKey}`, audit.id, 60 * 60 * 24),
    kvOrRedisSet(`${QUERY_PREFIX}${queryKey}`, audit.id, 60 * 60 * 24),
    recentIdsPromise,
  ]);
}

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetSeconds: number;
}

/** Extract trusted client IP from Cloudflare / reverse-proxy headers. */
export function extractClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "local";
}

function buildRateBucket(
  scope: string,
  clientIp: string,
  windowSeconds: number
): { bucketKey: string; resetSeconds: number } {
  const nowSec = Math.floor(Date.now() / 1000);
  const bucketIdx = Math.floor(nowSec / windowSeconds);
  const resetSeconds = Math.max(
    10,
    (bucketIdx + 1) * windowSeconds - nowSec
  );
  const safeIp = clientIp.replace(/[^a-fA-F0-9.:]/g, "").slice(0, 48) || "anon";
  return {
    bucketKey: `${scope}:${safeIp}:${bucketIdx}`,
    resetSeconds,
  };
}

/**
 * Generic edge-safe fixed-window IP rate limiter.
 * Set `consume: false` to peek without burning quota (e.g. before checking geohash cache).
 */
export async function checkScopedRateLimit(params: {
  scope: string;
  clientIp: string;
  limit: number;
  windowSeconds: number;
  consume?: boolean;
}): Promise<RateLimitStatus> {
  const { scope, clientIp, limit, windowSeconds, consume = true } = params;
  const { bucketKey, resetSeconds } = buildRateBucket(
    scope,
    clientIp,
    windowSeconds
  );
  const store = getMemoryStore();

  let current = store.rateLimits.get(bucketKey) ?? 0;
  if (current === 0) {
    const remoteCount = await kvOrRedisGet(`${RATE_PREFIX}${bucketKey}`);
    if (remoteCount) {
      const parsed = Number.parseInt(remoteCount, 10);
      if (Number.isFinite(parsed)) current = parsed;
    }
  }

  if (current >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      resetSeconds,
    };
  }

  if (!consume) {
    return {
      allowed: true,
      remaining: Math.max(0, limit - current),
      limit,
      resetSeconds,
    };
  }

  const next = current + 1;
  if (store.rateLimits.size > 2000) {
    store.rateLimits.clear();
  }
  store.rateLimits.set(bucketKey, next);
  await kvOrRedisSet(
    `${RATE_PREFIX}${bucketKey}`,
    String(next),
    Math.max(60, windowSeconds + 60)
  );

  return {
    allowed: true,
    remaining: Math.max(0, limit - next),
    limit,
    resetSeconds,
  };
}

/** Backwards-compatible hourly IP rate limiter (default 10 live audits/hour per IP). */
export async function checkIpRateLimit(
  clientIp: string,
  limitPerHour = 10,
  consume = true
): Promise<RateLimitStatus> {
  return checkScopedRateLimit({
    scope: "audit",
    clientIp,
    limit: limitPerHour,
    windowSeconds: 3600,
    consume,
  });
}

export async function listRecentAudits(limit = 20): Promise<AuditRecord[]> {
  const store = getMemoryStore();

  // Hydrate persistent KV/Redis audit index once per isolate lifecycle
  if (!store.recentHydrated) {
    store.recentHydrated = true;
    const rawIds = await kvOrRedisGet(RECENT_AUDITS_KEY);
    if (rawIds) {
      try {
        const ids = JSON.parse(rawIds);
        if (Array.isArray(ids)) {
          const missing = ids
            .filter((x): x is string => typeof x === "string" && !store.audits.has(x))
            .slice(0, 40);
          await Promise.all(missing.map((id) => getAuditById(id)));
        }
      } catch {
        // Ignore malformed index
      }
    }
  }

  return Array.from(store.audits.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function recordEvent(event: FunnelEvent): Promise<void> {
  const store = getMemoryStore();
  store.events.unshift(event);
  if (store.events.length > 1000) {
    store.events.length = 1000;
  }

  await kvOrRedisSet(EVENTS_KEY, JSON.stringify(store.events.slice(0, 400)));
}

export async function listEvents(limit = 400): Promise<FunnelEvent[]> {
  const store = getMemoryStore();
  if (store.events.length === 0) {
    const raw = await kvOrRedisGet(EVENTS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as FunnelEvent[];
        if (Array.isArray(parsed)) {
          store.events = parsed;
        }
      } catch {
        // Ignore corrupt cache
      }
    }
  }
  return store.events.slice(0, limit);
}

export interface DailyActivityBucket {
  date: string;
  audits: number;
  events: number;
}

export interface AnonymizedAuditRow {
  id: string;
  neighborhoodLabel: string;
  cityLabel: string;
  countryCode: string;
  airportIata: string;
  distanceKm: number;
  altitudeFeet: number;
  insideCone: boolean;
  angleOffsetDeg: number;
  nightFlights: number;
  totalDailyMovements: number;
  verdict: AuditRecord["analysis"]["verdict"];
  mode: AuditRecord["mode"];
  totalCostUsd: number;
  createdAt: string;
}

export interface FunnelMetricsSnapshot {
  auditsGenerated: number;
  liveAuditsGenerated: number;
  sampleReportsAvailable: number;
  airnodehubCalls: number;
  estimatedAusdSpend: number;
  xShareClicks: number;
  xShareRatePct: number;
  pngDownloads: number;
  simPlays: number;
  negotiationCopies: number;
  mcpConfigCopies: number;
  signatureVerifications: number;
  dailyActivity: DailyActivityBucket[];
  recentNeighborhoods: AnonymizedAuditRow[];
}

export async function getFunnelMetricsSnapshot(): Promise<FunnelMetricsSnapshot> {
  const [audits, events] = await Promise.all([
    listRecentAudits(100),
    listEvents(500),
  ]);

  const countByType = (type: FunnelEventType) =>
    events.filter((e) => e.type === type).length;

  const sampleAudits = audits.filter((a) => a.featured);
  const userAudits = audits.filter((a) => !a.featured);
  const liveAudits = audits.filter((a) => a.mode === "LIVE");

  const auditEvents = countByType("audit_generated");
  const auditsGenerated = Math.max(userAudits.length, auditEvents);

  // Only count REAL live AirnodeHub calls (never inflate with pre-baked sample fixtures)
  const airnodehubCalls = liveAudits.reduce(
    (sum, a) => sum + a.attestations.length,
    0
  );
  const estimatedAusdSpend =
    Math.round(
      liveAudits.reduce((sum, a) => sum + a.totalCostUsd, 0) * 100
    ) / 100;

  const xShareClicks = countByType("x_share_click");
  const shareDenominator = Math.max(auditsGenerated, 1);
  const xShareRatePct =
    xShareClicks > 0
      ? Math.min(100, Math.round((xShareClicks / shareDenominator) * 1000) / 10)
      : 0;

  // Build 7-day UTC activity series (user-generated checks only, excluding static seeded fixtures)
  const dailyMap = new Map<string, DailyActivityBucket>();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    dailyMap.set(date, { date, audits: 0, events: 0 });
  }
  for (const audit of userAudits) {
    const day = audit.createdAt.slice(0, 10);
    const bucket = dailyMap.get(day);
    if (bucket) bucket.audits += 1;
  }
  for (const evt of events) {
    if (evt.type === "audit_generated") continue;
    const day = evt.timestamp.slice(0, 10);
    const bucket = dailyMap.get(day);
    if (bucket) bucket.events += 1;
  }

  // Last 20 audited neighborhoods (live user checks first, supplemented by sample reports)
  const recentNeighborhoods: AnonymizedAuditRow[] = [
    ...userAudits,
    ...sampleAudits,
  ]
    .slice(0, 20)
    .map((a) => ({
      id: a.id,
      neighborhoodLabel: a.neighborhoodLabel,
      cityLabel: a.cityLabel,
      countryCode: a.countryCode,
      airportIata: a.analysis.airportIata,
      distanceKm: a.analysis.distanceKm,
      altitudeFeet: a.analysis.altitudeFeet,
      insideCone: a.analysis.insideCone,
      angleOffsetDeg: a.analysis.angleOffsetDeg,
      nightFlights: a.analysis.nightFlights,
      totalDailyMovements: a.analysis.totalDailyMovements,
      verdict: a.analysis.verdict,
      mode: a.mode,
      totalCostUsd: a.totalCostUsd,
      createdAt: a.createdAt,
    }));

  return {
    auditsGenerated,
    liveAuditsGenerated: liveAudits.length,
    sampleReportsAvailable: sampleAudits.length,
    airnodehubCalls,
    estimatedAusdSpend,
    xShareClicks,
    xShareRatePct,
    pngDownloads: countByType("png_download"),
    simPlays: countByType("sim_play"),
    negotiationCopies: countByType("negotiation_copy"),
    mcpConfigCopies: countByType("mcp_config_copy"),
    signatureVerifications: countByType("signature_verify"),
    dailyActivity: Array.from(dailyMap.values()),
    recentNeighborhoods,
  };
}
