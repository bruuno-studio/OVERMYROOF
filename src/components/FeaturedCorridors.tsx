import Link from "next/link";
import {
  computeLateralDistanceKm,
  describeNoiseLevel,
  getHumanVerdict,
} from "@/lib/humanCopy";
import type { AuditRecord } from "@/lib/types";

interface FeaturedCorridorsProps {
  audits: AuditRecord[];
}

export function FeaturedCorridors({ audits }: FeaturedCorridorsProps) {
  return (
    <section aria-label="Popular Neighborhood Checks" className="space-y-5">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#18181B] sm:text-2xl">
            See real examples before you search
          </h2>
          <p className="mt-1 text-sm text-[#52525B]">
            Click any neighborhood below to inspect a full flight-path report, hear a simulated flyover, and compare loud airport zones against a quiet baseline.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#E7E5E4] bg-white px-3 py-1 text-xs font-medium text-[#52525B]">
          <span className="h-2 w-2 rounded-full bg-[#16A34A]" />
          Instant sample reports
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {audits.map((audit) => {
          const { analysis } = audit;
          const verdict = getHumanVerdict(analysis.verdict, analysis.insideCone, {
            nightFlights: analysis.nightFlights,
            totalDailyMovements: analysis.totalDailyMovements,
          });
          const noiseHint = describeNoiseLevel(analysis.estimatedDb);
          const lateralKm = computeLateralDistanceKm(
            analysis.distanceKm,
            analysis.angleOffsetDeg
          );

          return (
            <Link
              key={audit.id}
              href={`/audit/${audit.id}`}
              className="group flex flex-col justify-between rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-2xs transition-all hover:-translate-y-0.5 hover:border-[#CBD5E1] hover:shadow-md"
            >
              <div>
                {/* Top row: Neighborhood + Traffic-light Pill */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[#18181B] group-hover:text-[#0284C7]">
                        {audit.neighborhoodLabel}
                      </h3>
                      <span className="text-xs font-medium text-[#71717A]">
                        {audit.cityLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#52525B]">
                      {audit.featuredBlurb || audit.formattedAddress}
                    </p>
                  </div>

                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${verdict.badgeBgClass} ${verdict.badgeTextClass}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${verdict.dotClass}`}
                    />
                    {verdict.badgeLabel}
                  </span>
                </div>

                {/* 3 Easy-to-Scan Human Metrics */}
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#FAF9F7] p-3">
                  <div>
                    <div className="text-[11px] font-medium text-[#71717A]">
                      Airport
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-[#18181B]">
                      {analysis.airportIata} · {analysis.distanceKm.toFixed(1)} km
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-[#71717A]">
                      {analysis.insideCone ? "Plane Height" : "Flight Path"}
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-[#18181B]">
                      {analysis.insideCone
                        ? `~${analysis.altitudeFeet.toLocaleString()} ft`
                        : `~${lateralKm.toFixed(1)} km off`}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-[#71717A]">
                      11 PM–6 AM
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-[#18181B]">
                      {analysis.nightFlights} flights
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom row: Relatable noise comparison + arrow */}
              <div className="mt-4 flex items-center justify-between border-t border-[#F4F4F5] pt-3">
                <span className="text-xs text-[#52525B]">
                  <strong className="font-semibold text-[#18181B]">
                    ~{analysis.estimatedDb} dB
                  </strong>{" "}
                  · {noiseHint}
                </span>
                <span className="text-xs font-semibold text-[#0F172A] transition-transform group-hover:translate-x-0.5">
                  View report →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
