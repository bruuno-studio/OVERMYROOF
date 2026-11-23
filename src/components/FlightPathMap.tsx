"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import {
  computeLateralDistanceKm,
  formatPlainWindLabel,
  getHumanVerdict,
} from "@/lib/humanCopy";
import type { AuditRecord } from "@/lib/types";

interface FlightPathMapProps {
  audit: AuditRecord;
}

const TILE_SIZE = 256;
const MAP_W = 800;
const MAP_H = 420;
const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Spherical forward geodesic: point reached by moving `distanceKm` along `bearingDeg` from `(lat, lon)`. */
function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceKm: number
): { lat: number; lon: number } {
  const phi1 = lat * DEG_TO_RAD;
  const lambda1 = lon * DEG_TO_RAD;
  const theta = bearingDeg * DEG_TO_RAD;
  const delta = distanceKm / EARTH_RADIUS_KM;

  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) +
    Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));

  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
  const x = Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2);
  const lambda2 = lambda1 + Math.atan2(y, x);

  return {
    lat: phi2 * RAD_TO_DEG,
    lon: (((lambda2 * RAD_TO_DEG) + 540) % 360) - 180,
  };
}

/** Standard Web Mercator projection into pixel coordinates at zoom `z`. */
function projectWebMercator(
  lat: number,
  lon: number,
  zoom: number
): { x: number; y: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * scale;
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const sinLat = Math.sin(clampedLat * DEG_TO_RAD);
  const y =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/** Choose initial integer zoom level so airport + stay fit comfortably inside viewport. */
function computeInitialZoom(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  distanceKm: number
): number {
  for (let z = 13; z >= 9; z--) {
    const p1 = projectWebMercator(lat1, lon1, z);
    const p2 = projectWebMercator(lat2, lon2, z);
    const dx = Math.abs(p1.x - p2.x);
    const dy = Math.abs(p1.y - p2.y);
    // Keep both markers comfortably inside the middle ~60% of the map
    if (dx < MAP_W * 0.56 && dy < MAP_H * 0.56) {
      if (distanceKm < 2.2 && z > 13) return 13;
      return z;
    }
  }
  return 10;
}

/** Build a smooth GPS flight-cone polygon (origin -> left arc -> right arc). */
function buildConePoints(
  originLat: number,
  originLon: number,
  centerBearingDeg: number,
  halfAngleDeg: number,
  radiusKm: number
): Array<{ lat: number; lon: number }> {
  const pts: Array<{ lat: number; lon: number }> = [
    { lat: originLat, lon: originLon },
  ];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const angle =
      centerBearingDeg - halfAngleDeg + (2 * halfAngleDeg * i) / steps;
    pts.push(destinationPoint(originLat, originLon, angle, radiusKm));
  }
  return pts;
}

/** Side-profile visual showing real plane height vs buildings (or lateral separation if off flight path). */
function SideViewHeightDiagram({ audit }: { audit: AuditRecord }) {
  const { analysis } = audit;
  const verdict = getHumanVerdict(analysis.verdict, analysis.insideCone, {
    nightFlights: analysis.nightFlights,
    totalDailyMovements: analysis.totalDailyMovements,
  });
  const lateralKm = computeLateralDistanceKm(
    analysis.distanceKm,
    analysis.angleOffsetDeg
  );

  if (!analysis.insideCone) {
    return (
      <div className="p-5 sm:p-6">
        <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#18181B]">
                Lateral Clearance — Planes Do Not Fly Directly Over This Roof
              </h3>
              <p className="text-xs text-[#52525B]">
                This address sits {analysis.angleOffsetDeg.toFixed(1)}° off{" "}
                {analysis.airportIata} Runway {analysis.runwayName}&apos;s path, roughly{" "}
                <strong>{lateralKm.toFixed(1)} km to the side</strong> of the flight centerline.
              </p>
            </div>
            <span className="rounded-full bg-[#DCFCE7] px-3 py-1 text-xs font-semibold text-[#15803D]">
              ~{lateralKm.toFixed(1)} km side clearance
            </span>
          </div>

          <svg
            viewBox="0 0 720 210"
            className="h-auto w-full rounded-xl bg-white"
            role="img"
            aria-label={`Lateral separation diagram showing flight corridor ${lateralKm.toFixed(1)} km away from this stay`}
          >
            {/* Sky & ground */}
            <rect x="0" y="0" width="720" height="158" fill="#F0F9FF" />
            <rect x="0" y="158" width="720" height="52" fill="#F4F4F5" />
            <line x1="0" y1="158" x2="720" y2="158" stroke="#D4D4D8" strokeWidth="1.5" />

            {/* Left: Flight corridor column */}
            <rect
              x="70"
              y="18"
              width="140"
              height="140"
              rx="12"
              fill={verdict.accentHex}
              fillOpacity="0.12"
              stroke={verdict.accentHex}
              strokeOpacity="0.45"
              strokeDasharray="5 4"
            />
            <text
              x="140"
              y="40"
              textAnchor="middle"
              fill="#52525B"
              fontSize="11"
              fontWeight="700"
              fontFamily="sans-serif"
            >
              {analysis.airportIata} FLIGHT PATH
            </text>

            {/* Front-view airplane silhouette in corridor */}
            <g transform="translate(140, 88)">
              <line x1="-32" y1="0" x2="32" y2="0" stroke="#0F172A" strokeWidth="4" strokeLinecap="round" />
              <line x1="0" y1="-12" x2="0" y2="4" stroke="#0F172A" strokeWidth="3.5" strokeLinecap="round" />
              <circle cx="0" cy="0" r="5" fill="#0F172A" />
              <circle cx="-13" cy="4" r="3" fill="#475569" />
              <circle cx="13" cy="4" r="3" fill="#475569" />
            </g>
            <text
              x="140"
              y="142"
              textAnchor="middle"
              fill="#52525B"
              fontSize="10"
              fontFamily="sans-serif"
            >
              Runway {analysis.runwayName} line
            </text>

            {/* Horizontal clearance arrow */}
            <line
              x1="224"
              y1="112"
              x2="516"
              y2="112"
              stroke="#0284C7"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <polygon points="224,112 234,107 234,117" fill="#0284C7" />
            <polygon points="516,112 506,107 506,117" fill="#0284C7" />
            <rect x="292" y="95" width="156" height="32" rx="16" fill="#0F172A" />
            <text
              x="370"
              y="115"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="12"
              fontWeight="700"
              fontFamily="sans-serif"
            >
              ~{lateralKm.toFixed(1)} km to the side
            </text>

            {/* Right: Stay building */}
            <g transform="translate(545, 102)">
              <rect x="0" y="14" width="76" height="42" rx="4" fill="#FFFFFF" stroke="#0F172A" strokeWidth="2" />
              <polygon points="-6,16 38,-6 82,16" fill="#0F172A" />
              <rect x="14" y="26" width="12" height="12" rx="2" fill="#BAE6FD" />
              <rect x="32" y="26" width="12" height="12" rx="2" fill="#BAE6FD" />
              <rect x="50" y="26" width="12" height="12" rx="2" fill="#BAE6FD" />
            </g>
            <text
              x="583"
              y="182"
              textAnchor="middle"
              fill="#18181B"
              fontSize="12"
              fontWeight="700"
              fontFamily="sans-serif"
            >
              This Stay
            </text>
            <text
              x="583"
              y="197"
              textAnchor="middle"
              fill="#71717A"
              fontSize="10"
              fontFamily="sans-serif"
            >
              Not directly under jets
            </text>
          </svg>
        </div>
      </div>
    );
  }

  // Inside flight corridor: clear side-view glidepath height comparison!
  const cappedAltFt = Math.max(250, Math.min(2600, analysis.altitudeFeet));
  // Lower altitude -> plane sits closer to roof (higher Y coordinate)
  const planeY = Math.round(115 - ((cappedAltFt - 250) / 2350) * 75);
  const stories = Math.max(10, Math.round(analysis.altitudeFeet / 11));

  return (
    <div className="p-5 sm:p-6">
      <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[#18181B]">
              Side View — How Low Jets Pass Above This Roof
            </h3>
            <p className="text-xs text-[#52525B]">
              {analysis.corridorType === "DEPARTURE"
                ? `Typical ~6.2° commercial climb gradient at ${analysis.distanceKm.toFixed(1)} km from ${analysis.airportIata} Runway ${analysis.runwayName}.`
                : `Standard 3° ILS landing glideslope at ${analysis.distanceKm.toFixed(1)} km from ${analysis.airportIata} Runway ${analysis.runwayName}.`}
            </p>
          </div>
          <span
            style={{ color: verdict.accentHex }}
            className="rounded-full bg-white px-3 py-1 text-xs font-bold ring-1 ring-[#E2E8F0]"
          >
            ~{analysis.altitudeFeet.toLocaleString()} ft ({analysis.altitudeMeters} m) · ~{stories} stories
          </span>
        </div>

        <svg
          viewBox="0 0 720 220"
          className="h-auto w-full rounded-xl bg-white"
          role="img"
          aria-label={`Side profile showing jets passing ${analysis.altitudeFeet} feet above this roof`}
        >
          {/* Sky & ground */}
          <rect x="0" y="0" width="720" height="170" fill="#F0F9FF" />
          <rect x="0" y="170" width="720" height="50" fill="#F4F4F5" />
          <line x1="0" y1="170" x2="720" y2="170" stroke="#D4D4D8" strokeWidth="1.5" />

          {/* Left: Airport runway strip */}
          <rect x="34" y="164" width="110" height="10" rx="3" fill="#0F172A" />
          <text
            x="89"
            y="194"
            textAnchor="middle"
            fill="#18181B"
            fontSize="11"
            fontWeight="700"
            fontFamily="sans-serif"
          >
            {analysis.airportIata} · RWY {analysis.runwayName}
          </text>

          {/* 3-degree glidepath sloped line from runway through plane */}
          <line
            x1="144"
            y1="168"
            x2="680"
            y2={Math.max(14, planeY - 26)}
            stroke={verdict.accentHex}
            strokeWidth="2.2"
            strokeDasharray="7 5"
          />

          {/* Vertical altitude ruler over the stay */}
          <line
            x1="490"
            y1={planeY + 12}
            x2="490"
            y2="134"
            stroke={verdict.accentHex}
            strokeWidth="2"
          />
          <polygon
            points={`490,${planeY + 10} 485,${planeY + 20} 495,${planeY + 20}`}
            fill={verdict.accentHex}
          />
          <polygon points="490,136 485,126 495,126" fill={verdict.accentHex} />

          {/* Altitude badge next to ruler */}
          <rect
            x="504"
            y={Math.round((planeY + 134) / 2) - 16}
            width="162"
            height="32"
            rx="8"
            fill="#0F172A"
          />
          <text
            x="585"
            y={Math.round((planeY + 134) / 2) + 4}
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="11.5"
            fontWeight="700"
            fontFamily="sans-serif"
          >
            ~{analysis.altitudeFeet.toLocaleString()} ft ({analysis.altitudeMeters} m)
          </text>

          {/* Side-view jet icon above the stay */}
          <g transform={`translate(490, ${planeY})`}>
            <path
              d="M -28 2 L 24 2 L 32 -1 L 24 -4 L 4 -4 L -12 -14 L -18 -14 L -8 -4 L -24 -4 L -30 -10 L -34 -10 L -29 2 Z"
              fill="#0F172A"
            />
          </g>

          {/* Stay apartment building silhouette */}
          <g transform="translate(460, 134)">
            <rect x="0" y="0" width="60" height="36" rx="3" fill="#FFFFFF" stroke="#0F172A" strokeWidth="2" />
            <rect x="9" y="8" width="10" height="9" rx="1.5" fill="#BAE6FD" />
            <rect x="25" y="8" width="10" height="9" rx="1.5" fill="#BAE6FD" />
            <rect x="41" y="8" width="10" height="9" rx="1.5" fill="#BAE6FD" />
            <rect x="9" y="21" width="10" height="9" rx="1.5" fill="#BAE6FD" />
            <rect x="25" y="21" width="10" height="9" rx="1.5" fill="#BAE6FD" />
            <rect x="41" y="21" width="10" height="9" rx="1.5" fill="#BAE6FD" />
          </g>
          <text
            x="490"
            y="194"
            textAnchor="middle"
            fill="#18181B"
            fontSize="11.5"
            fontWeight="700"
            fontFamily="sans-serif"
          >
            This Stay ({analysis.distanceKm.toFixed(1)} km)
          </text>
        </svg>
      </div>
    </div>
  );
}

export function FlightPathMap({ audit }: FlightPathMapProps) {
  const { analysis } = audit;
  const verdict = getHumanVerdict(analysis.verdict, analysis.insideCone, {
    nightFlights: analysis.nightFlights,
    totalDailyMovements: analysis.totalDailyMovements,
  });
  const lateralKm = computeLateralDistanceKm(
    analysis.distanceKm,
    analysis.angleOffsetDeg
  );

  const initialZoom = useMemo(
    () =>
      computeInitialZoom(
        analysis.airportLat,
        analysis.airportLon,
        audit.lat,
        audit.lon,
        analysis.distanceKm
      ),
    [
      analysis.airportLat,
      analysis.airportLon,
      audit.lat,
      audit.lon,
      analysis.distanceKm,
    ]
  );

  const initialCenterLat = (analysis.airportLat + audit.lat) / 2;
  const initialCenterLon = (analysis.airportLon + audit.lon) / 2;

  const [viewMode, setViewMode] = useState<"map" | "height">("map");
  const [tileStyle, setTileStyle] = useState<"clean" | "osm">("clean");
  const [zoom, setZoom] = useState(initialZoom);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    basePanX: number;
    basePanY: number;
  }>({ active: false, startX: 0, startY: 0, basePanX: 0, basePanY: 0 });

  const centerWorld = useMemo(
    () => projectWebMercator(initialCenterLat, initialCenterLon, zoom),
    [initialCenterLat, initialCenterLon, zoom]
  );

  // Convert any GPS coordinate to SVG viewport (800x420) pixel space
  const toScreen = (lat: number, lon: number) => {
    const p = projectWebMercator(lat, lon, zoom);
    return {
      x: MAP_W / 2 + (p.x - centerWorld.x) + pan.x,
      y: MAP_H / 2 + (p.y - centerWorld.y) + pan.y,
    };
  };

  // Compute visible slippy map tiles (100% free, zero API keys: Esri World Topo or OpenStreetMap)
  const tiles = useMemo(() => {
    const viewLeft = centerWorld.x - MAP_W / 2 - pan.x;
    const viewTop = centerWorld.y - MAP_H / 2 - pan.y;
    const minTx = Math.floor(viewLeft / TILE_SIZE) - 1;
    const maxTx = Math.floor((viewLeft + MAP_W) / TILE_SIZE) + 1;
    const minTy = Math.floor(viewTop / TILE_SIZE) - 1;
    const maxTy = Math.floor((viewTop + MAP_H) / TILE_SIZE) + 1;
    const maxTileIndex = Math.pow(2, zoom);

    const list: Array<{ key: string; url: string; fallbackUrl: string; left: number; top: number }> = [];
    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let ty = minTy; ty <= maxTy; ty++) {
        if (ty < 0 || ty >= maxTileIndex) continue;
        const wrappedTx = ((tx % maxTileIndex) + maxTileIndex) % maxTileIndex;
        const esriUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${zoom}/${ty}/${wrappedTx}`;
        const osmUrl = `https://tile.openstreetmap.org/${zoom}/${wrappedTx}/${ty}.png`;
        list.push({
          key: `${tileStyle}-${zoom}-${tx}-${ty}`,
          url: tileStyle === "clean" ? esriUrl : osmUrl,
          fallbackUrl: tileStyle === "clean" ? osmUrl : esriUrl,
          left: tx * TILE_SIZE - viewLeft,
          top: ty * TILE_SIZE - viewTop,
        });
      }
    }
    return list;
  }, [centerWorld.x, centerWorld.y, pan.x, pan.y, zoom, tileStyle]);

  // True GPS runway & flight-corridor geometry
  const approachBearing = (analysis.runwayTrueHdg + 180) % 360;
  const departureBearing = analysis.runwayTrueHdg;
  const primaryBearing =
    analysis.corridorType === "DEPARTURE" ? departureBearing : approachBearing;
  const secondaryBearing =
    analysis.corridorType === "DEPARTURE" ? approachBearing : departureBearing;

  const airportPt = toScreen(analysis.airportLat, analysis.airportLon);
  const stayPt = toScreen(audit.lat, audit.lon);

  const rwyEndA = destinationPoint(
    analysis.airportLat,
    analysis.airportLon,
    departureBearing,
    1.6
  );
  const rwyEndB = destinationPoint(
    analysis.airportLat,
    analysis.airportLon,
    approachBearing,
    1.6
  );
  const rwyScreenA = toScreen(rwyEndA.lat, rwyEndA.lon);
  const rwyScreenB = toScreen(rwyEndB.lat, rwyEndB.lon);

  const toPolygonString = (pts: Array<{ lat: number; lon: number }>) =>
    pts
      .map((p) => {
        const s = toScreen(p.lat, p.lon);
        return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
      })
      .join(" ");

  const primaryOuterCone = toPolygonString(
    buildConePoints(
      analysis.airportLat,
      analysis.airportLon,
      primaryBearing,
      12,
      16
    )
  );
  const primaryInnerCone = toPolygonString(
    buildConePoints(
      analysis.airportLat,
      analysis.airportLon,
      primaryBearing,
      12,
      8
    )
  );
  const secondaryCone = toPolygonString(
    buildConePoints(
      analysis.airportLat,
      analysis.airportLon,
      secondaryBearing,
      12,
      12
    )
  );

  const primaryLineEnd = toScreen(
    ...(() => {
      const p = destinationPoint(
        analysis.airportLat,
        analysis.airportLon,
        primaryBearing,
        16
      );
      return [p.lat, p.lon] as const;
    })()
  );
  const secondaryLineEnd = toScreen(
    ...(() => {
      const p = destinationPoint(
        analysis.airportLat,
        analysis.airportLon,
        secondaryBearing,
        12
      );
      return [p.lat, p.lon] as const;
    })()
  );

  const midpointX = (airportPt.x + stayPt.x) / 2;
  const midpointY = (airportPt.y + stayPt.y) / 2;
  const vecDx = stayPt.x - airportPt.x;
  const vecDy = stayPt.y - airportPt.y;
  const isMostlyHorizontal = Math.abs(vecDx) >= Math.abs(vecDy);

  // Place the "This Stay" label away from the airport->stay vector so it never covers the distance pill
  const stayLabelWidth = 152;
  const stayLabelHeight = 36;
  const stayLabelPos = isMostlyHorizontal
    ? {
        x: Math.max(
          10,
          Math.min(MAP_W - stayLabelWidth - 10, stayPt.x - stayLabelWidth / 2)
        ),
        y: stayPt.y > 72 ? stayPt.y - stayLabelHeight - 16 : stayPt.y + 18,
      }
    : {
        x:
          stayPt.x < MAP_W - stayLabelWidth - 24
            ? stayPt.x + 16
            : Math.max(10, stayPt.x - stayLabelWidth - 16),
        y: Math.max(
          10,
          Math.min(MAP_H - stayLabelHeight - 10, stayPt.y - stayLabelHeight / 2)
        ),
      };

  // Offset the midpoint distance pill slightly off the centerline when horizontal so it stays readable
  const distPillX = midpointX;
  const distPillY = isMostlyHorizontal ? midpointY + 18 : midpointY;

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    // Never steal pointer capture from interactive overlay buttons (+, −, recenter, Clean/Street Labels)
    if (
      (e.target as HTMLElement | null)?.closest(
        "button, a, input, [data-map-control]"
      )
    ) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      basePanX: pan.x,
      basePanY: pan.y,
    };
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) return;
    setPan({
      x: dragRef.current.basePanX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.basePanY + (e.clientY - dragRef.current.startY),
    });
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    dragRef.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function handleZoomChange(delta: number) {
    const next = Math.max(9, Math.min(15, zoom + delta));
    if (next === zoom) return;
    const factor = Math.pow(2, next - zoom);
    setZoom(next);
    setPan((prev) => ({
      x: prev.x * factor,
      y: prev.y * factor,
    }));
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E7E5E4] bg-white">
      {/* Header with Map / Side-View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7E5E4] px-4 py-3">
        <div>
          <span className="text-sm font-bold text-[#18181B]">
            Real Flight Path Map
          </span>
          <span className="ml-2 text-xs text-[#71717A]">
            {analysis.airportIata} Runway {analysis.runwayName} · North-up view
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-[#E7E5E4] bg-[#FAF9F7] p-1">
          <button
            type="button"
            onClick={() => setViewMode("map")}
            className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors ${viewMode === "map"
                ? "bg-[#0F172A] text-white"
                : "text-[#52525B] hover:text-[#18181B]"
              }`}
          >
            Street Map
          </button>
          <button
            type="button"
            onClick={() => setViewMode("height")}
            className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors ${viewMode === "height"
                ? "bg-[#0F172A] text-white"
                : "text-[#52525B] hover:text-[#18181B]"
              }`}
          >
            Height &amp; Clearance
          </button>
        </div>
      </div>

      {viewMode === "height" ? (
        <SideViewHeightDiagram audit={audit} />
      ) : (
        <>
          {/* Interactive Slippy Tile Street Map + True GPS Flight Corridor Overlay */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative h-[360px] w-full cursor-grab overflow-hidden bg-[#EEF2F6] select-none active:cursor-grabbing sm:h-[420px]"
          >
            {/* Scaled Web Mercator Canvas centered responsively */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                style={{ width: `${MAP_W}px`, height: `${MAP_H}px` }}
                className="relative shrink-0"
              >
                {/* Zero-API-key free street map tiles (Esri World Topo / OpenStreetMap) */}
                {tiles.map((tile) => (
                  <img
                    key={tile.key}
                    src={tile.url}
                    alt=""
                    draggable={false}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (img.dataset.fallbackApplied) return;
                      img.dataset.fallbackApplied = "1";
                      img.src = tile.fallbackUrl;
                    }}
                    style={{
                      position: "absolute",
                      left: `${tile.left}px`,
                      top: `${tile.top}px`,
                      width: `${TILE_SIZE}px`,
                      height: `${TILE_SIZE}px`,
                    }}
                    className={`pointer-events-none max-w-none ${tileStyle === "osm"
                        ? "saturate-[0.78] brightness-[1.03] contrast-[0.95]"
                        : ""
                      }`}
                  />
                ))}

                {/* True GPS SVG Flight Corridors, Runway, and Stay Pin */}
                <svg
                  viewBox={`0 0 ${MAP_W} ${MAP_H}`}
                  width={MAP_W}
                  height={MAP_H}
                  className="pointer-events-none absolute inset-0"
                  role="img"
                  aria-label={`Interactive street map showing ${analysis.airportIata} Runway ${analysis.runwayName} flight corridors and this stay ${analysis.distanceKm} km away`}
                >
                  {/* Secondary opposite-end corridor (subtle blue-slate) */}
                  <polygon
                    points={secondaryCone}
                    fill="#0284C7"
                    fillOpacity="0.08"
                    stroke="#0284C7"
                    strokeOpacity="0.35"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                  />
                  <line
                    x1={airportPt.x}
                    y1={airportPt.y}
                    x2={secondaryLineEnd.x}
                    y2={secondaryLineEnd.y}
                    stroke="#0284C7"
                    strokeOpacity="0.4"
                    strokeWidth="1.2"
                    strokeDasharray="6 5"
                  />

                  {/* Primary flight corridor outer 16 km cone */}
                  <polygon
                    points={primaryOuterCone}
                    fill={verdict.accentHex}
                    fillOpacity="0.14"
                    stroke={verdict.accentHex}
                    strokeOpacity="0.55"
                    strokeWidth="1.5"
                  />

                  {/* Primary flight corridor inner 8 km loud zone */}
                  <polygon
                    points={primaryInnerCone}
                    fill={verdict.accentHex}
                    fillOpacity="0.22"
                    stroke={verdict.accentHex}
                    strokeOpacity="0.75"
                    strokeWidth="1.5"
                  />

                  {/* Extended runway flight centerline */}
                  <line
                    x1={airportPt.x}
                    y1={airportPt.y}
                    x2={primaryLineEnd.x}
                    y2={primaryLineEnd.y}
                    stroke={verdict.accentHex}
                    strokeOpacity="0.85"
                    strokeWidth="1.8"
                    strokeDasharray="8 6"
                  />

                  {/* True-heading runway strip */}
                  <line
                    x1={rwyScreenA.x}
                    y1={rwyScreenA.y}
                    x2={rwyScreenB.x}
                    y2={rwyScreenB.y}
                    stroke="#0F172A"
                    strokeWidth="9"
                    strokeLinecap="round"
                  />
                  <line
                    x1={rwyScreenA.x}
                    y1={rwyScreenA.y}
                    x2={rwyScreenB.x}
                    y2={rwyScreenB.y}
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />

                  {/* Distance vector between Airport and This Stay */}
                  <line
                    x1={airportPt.x}
                    y1={airportPt.y}
                    x2={stayPt.x}
                    y2={stayPt.y}
                    stroke="#0F172A"
                    strokeOpacity="0.55"
                    strokeWidth="1.6"
                    strokeDasharray="4 4"
                  />

                  {/* Midpoint distance pill */}
                  <g transform={`translate(${distPillX}, ${distPillY})`}>
                    <rect
                      x="-32"
                      y="-11"
                      width="64"
                      height="22"
                      rx="11"
                      fill="#FFFFFF"
                      stroke="#CBD5E1"
                      strokeWidth="1.2"
                    />
                    <text
                      x="0"
                      y="4"
                      textAnchor="middle"
                      fill="#0F172A"
                      fontSize="10.5"
                      fontWeight="700"
                      fontFamily="sans-serif"
                    >
                      {analysis.distanceKm.toFixed(1)} km
                    </text>
                  </g>

                  {/* Airport Pin Badge */}
                  <g transform={`translate(${airportPt.x}, ${airportPt.y})`}>
                    <circle
                      cx="0"
                      cy="0"
                      r="14"
                      fill="#0F172A"
                      stroke="#FFFFFF"
                      strokeWidth="2.5"
                    />
                    <text
                      x="0"
                      y="4"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="9"
                      fontWeight="800"
                      fontFamily="sans-serif"
                    >
                      {analysis.airportIata}
                    </text>
                  </g>

                  {/* "This Stay" Pin Marker */}
                  <g transform={`translate(${stayPt.x}, ${stayPt.y})`}>
                    <circle
                      cx="0"
                      cy="0"
                      r="16"
                      fill={verdict.accentHex}
                      fillOpacity="0.22"
                    />
                    <circle
                      cx="0"
                      cy="0"
                      r="7.5"
                      fill={verdict.accentHex}
                      stroke="#FFFFFF"
                      strokeWidth="2.5"
                    />
                  </g>

                  {/* Smart non-overlapping floating label pill for "This Stay" */}
                  <g transform={`translate(${stayLabelPos.x}, ${stayLabelPos.y})`}>
                    <rect
                      x="0"
                      y="0"
                      width={stayLabelWidth}
                      height={stayLabelHeight}
                      rx="10"
                      fill="#0F172A"
                      fillOpacity="0.94"
                    />
                    <text
                      x="10"
                      y="15"
                      fill="#FFFFFF"
                      fontSize="10.5"
                      fontWeight="700"
                      fontFamily="sans-serif"
                    >
                      This Stay
                    </text>
                    <text
                      x="10"
                      y="28"
                      fill="#CBD5E1"
                      fontSize="9.5"
                      fontFamily="sans-serif"
                    >
                      {analysis.insideCone
                        ? `~${analysis.altitudeFeet.toLocaleString()} ft overhead`
                        : `~${lateralKm.toFixed(1)} km off flight path`}
                    </text>
                  </g>
                </svg>
              </div>
            </div>

            {/* Top-left Wind & Compass Badge */}
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-[#E7E5E4] bg-white/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur-xs">
              <span className="font-bold text-[#0F172A]">N ↑</span>
              <span className="text-[#CBD5E1]">|</span>
              <span className="font-medium text-[#3F3F46]">
                Wind: {formatPlainWindLabel(analysis.prevailingWindLabel)} ({analysis.activeWindPct}%)
              </span>
            </div>

            {/* Top-right Interactive Zoom Controls */}
            <div
              data-map-control="true"
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-3 top-3 z-20 flex flex-col overflow-hidden rounded-xl border border-[#E7E5E4] bg-white/95 shadow-sm backdrop-blur-xs"
            >
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoom >= 15}
                onClick={(e) => {
                  e.stopPropagation();
                  handleZoomChange(1);
                }}
                className="flex h-8 w-8 cursor-pointer items-center justify-center border-b border-[#E7E5E4] text-sm font-bold text-[#18181B] hover:bg-[#FAF9F7] disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoom <= 9}
                onClick={(e) => {
                  e.stopPropagation();
                  handleZoomChange(-1);
                }}
                className="flex h-8 w-8 cursor-pointer items-center justify-center border-b border-[#E7E5E4] text-sm font-bold text-[#18181B] hover:bg-[#FAF9F7] disabled:cursor-not-allowed disabled:opacity-40"
              >
                −
              </button>
              <button
                type="button"
                aria-label="Recenter map"
                title="Reset map view"
                onClick={(e) => {
                  e.stopPropagation();
                  setZoom(initialZoom);
                  setPan({ x: 0, y: 0 });
                }}
                className="flex h-8 w-8 cursor-pointer items-center justify-center text-xs font-bold text-[#52525B] hover:bg-[#FAF9F7] hover:text-[#18181B]"
              >
                ⌖
              </button>
            </div>

            {/* Bottom-left Map Style Toggle (Clean Esri vs Detailed OSM — both 100% free) */}
            <div
              data-map-control="true"
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute bottom-2.5 left-3 z-20 flex items-center gap-1 rounded-full border border-[#E7E5E4] bg-white/95 p-0.5 text-[11px] shadow-xs backdrop-blur-xs"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTileStyle("clean");
                }}
                className={`cursor-pointer rounded-full px-2.5 py-0.5 font-semibold transition-colors ${tileStyle === "clean"
                    ? "bg-[#0F172A] text-white"
                    : "text-[#52525B] hover:text-[#18181B]"
                  }`}
              >
                Clean
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTileStyle("osm");
                }}
                className={`cursor-pointer rounded-full px-2.5 py-0.5 font-semibold transition-colors ${tileStyle === "osm"
                    ? "bg-[#0F172A] text-white"
                    : "text-[#52525B] hover:text-[#18181B]"
                  }`}
              >
                Street Labels
              </button>
            </div>

            {/* Bottom-right Map Attribution */}
            <div className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-white/90 px-2 py-0.5 text-[10px] text-[#52525B]">
              {tileStyle === "clean"
                ? "© Esri · © OpenStreetMap"
                : "© OpenStreetMap contributors"}
            </div>
          </div>

          {/* Plain-English Map Legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E7E5E4] bg-[#FAF9F7] px-4 py-2.5 text-xs text-[#52525B]">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span
                  style={{ backgroundColor: verdict.accentHex }}
                  className="h-2.5 w-2.5 rounded-full"
                />
                This stay
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  style={{ backgroundColor: verdict.accentHex }}
                  className="h-2.5 w-4 rounded-xs opacity-35"
                />
                Main runway flight path (0–16 km)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-xs bg-[#0F172A]" />
                {analysis.airportIata} runway
              </span>
            </div>
            <span className="text-[11px] text-[#71717A]">
              Drag to pan · Click &ldquo;Height &amp; Clearance&rdquo; for side view
            </span>
          </div>
        </>
      )}
    </div>
  );
}
