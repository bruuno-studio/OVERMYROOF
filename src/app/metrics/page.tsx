import type { Metadata } from "next";
import Link from "next/link";
import { McpCopyBanner } from "@/components/McpCopyBanner";
import { isDemoMode } from "@/lib/airnodehub";
import { computeLateralDistanceKm, getHumanVerdict } from "@/lib/humanCopy";
import { getFunnelMetricsSnapshot } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live Stats & Funnel Metrics | OverMyRoof",
  description:
    "Live OverMyRoof checks, AirnodeHub x402 API calls, X share conversion, audio plays, host message copies, and developer MCP copies.",
};

export default async function MetricsPage() {
  const metrics = await getFunnelMetricsSnapshot();
  const demoMode = isDemoMode();
  const maxDaily = Math.max(
    1,
    ...metrics.dailyActivity.map((d) => Math.max(d.audits, d.events))
  );

  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      {/* Top Nav */}
      <header className="sticky top-0 z-30 border-b border-[#E7E5E4]/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E5E4] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#3F3F46] transition-colors hover:border-[#0F172A] hover:text-[#0F172A]"
            >
              ← Back to search
            </Link>
            <Link
              href="/"
              className="text-sm font-extrabold tracking-tight text-[#18181B]"
            >
              OverMyRoof
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E5E4] bg-[#FAF9F7] px-3 py-1 text-xs font-medium text-[#52525B]">
              <span
                className={`h-2 w-2 rounded-full ${
                  demoMode ? "bg-[#D97706]" : "bg-[#16A34A]"
                }`}
              />
              {demoMode ? "Demo Preview" : "Live Flight Data"}
            </span>
            <a
              href="/api/events"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-[#E7E5E4] bg-white px-3 py-1 text-xs font-semibold text-[#3F3F46] hover:border-[#0F172A] hover:text-[#0F172A]"
            >
              JSON Feed ↗
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
        {/* Heading */}
        <div>
          <span className="inline-flex items-center rounded-full bg-[#F0F9FF] px-3 py-1 text-xs font-semibold text-[#0369A1]">
            Live Product &amp; Protocol Telemetry
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#18181B]">
            OverMyRoof Live Stats
          </h1>
          <p className="mt-1.5 text-sm text-[#52525B]">
            Real-time address checks, signed AirnodeHub API calls, social shares, audio simulator plays, and developer MCP copies.
          </p>
        </div>

        {/* 6 Clean KPI Cards */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-2xs">
            <div className="text-xs font-medium text-[#71717A]">
              Addresses Checked
            </div>
            <div className="mt-2 text-3xl font-extrabold text-[#18181B]">
              {metrics.auditsGenerated.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-[#52525B]">
              {metrics.liveAuditsGenerated} live x402 ·{" "}
              {metrics.sampleReportsAvailable} featured sample previews
            </div>
          </div>

          <div className="rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-2xs">
            <div className="text-xs font-medium text-[#71717A]">
              AirnodeHub Calls &amp; aUSD Spend
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#18181B]">
                {metrics.airnodehubCalls.toLocaleString()}
              </span>
              <span className="rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-xs font-bold text-[#15803D]">
                ${metrics.estimatedAusdSpend.toFixed(2)} aUSD
              </span>
            </div>
            <div className="mt-1 text-xs text-[#52525B]">
              Signed Geoapify, AeroDataBox &amp; Open-Meteo calls
            </div>
          </div>

          <div className="rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-2xs">
            <div className="text-xs font-medium text-[#71717A]">
              X Share Rate
            </div>
            <div className="mt-2 text-3xl font-extrabold text-[#18181B]">
              {metrics.xShareRatePct.toFixed(1)}%
            </div>
            <div className="mt-1 text-xs text-[#52525B]">
              {metrics.xShareClicks} X shares · {metrics.pngDownloads} PNG downloads
            </div>
          </div>

          <div className="rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-2xs">
            <div className="text-xs font-medium text-[#71717A]">
              Flyover Sound Plays
            </div>
            <div className="mt-2 text-3xl font-extrabold text-[#18181B]">
              {metrics.simPlays.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-[#52525B]">
              Web Audio Doppler previews played
            </div>
          </div>

          <div className="rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-2xs">
            <div className="text-xs font-medium text-[#71717A]">
              Host / Landlord Messages Copied
            </div>
            <div className="mt-2 text-3xl font-extrabold text-[#18181B]">
              {metrics.negotiationCopies.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-[#52525B]">
              Ready-to-send inquiries copied
            </div>
          </div>

          <div className="rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-2xs">
            <div className="text-xs font-medium text-[#71717A]">
              Developer MCP Config Copies
            </div>
            <div className="mt-2 text-3xl font-extrabold text-[#0284C7]">
              {metrics.mcpConfigCopies.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-[#52525B]">
              {metrics.signatureVerifications} cryptographic verifications run
            </div>
          </div>
        </section>

        {/* 7-Day Activity Chart */}
        <section className="rounded-3xl border border-[#E7E5E4] bg-white p-6 shadow-2xs">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[#18181B]">
                Daily Activity (Last 7 Days)
              </h2>
              <p className="text-xs text-[#71717A]">
                New reports generated vs. interactive actions
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-[#52525B]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#0F172A]" /> Reports
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#0284C7]" /> Interactions
              </span>
            </div>
          </div>

          <div className="grid h-44 grid-cols-7 items-end gap-3 rounded-2xl bg-[#FAF9F7] px-4 pb-3 pt-6">
            {metrics.dailyActivity.map((day) => {
              const auditH = Math.max(
                6,
                Math.round((day.audits / maxDaily) * 100)
              );
              const eventH = Math.max(
                6,
                Math.round((day.events / maxDaily) * 100)
              );
              return (
                <div
                  key={day.date}
                  className="flex h-full flex-col items-center justify-end gap-2"
                >
                  <div className="flex h-full w-full items-end justify-center gap-1.5">
                    <div
                      title={`${day.date}: ${day.audits} reports`}
                      style={{ height: `${auditH}%` }}
                      className="w-4 rounded-t-md bg-[#0F172A]"
                    />
                    <div
                      title={`${day.date}: ${day.events} interactions`}
                      style={{ height: `${eventH}%` }}
                      className="w-4 rounded-t-md bg-[#0284C7]"
                    />
                  </div>
                  <div className="text-center text-[11px] font-medium text-[#52525B]">
                    {day.date.slice(5)}
                    <div className="font-data text-[10px] text-[#71717A]">
                      {day.audits}/{day.events}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Anonymized Recent 20 Checks */}
        <section className="overflow-hidden rounded-3xl border border-[#E7E5E4] bg-white shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7E5E4] px-6 py-4">
            <div>
              <h2 className="text-base font-bold text-[#18181B]">
                Recent Neighborhood Checks
              </h2>
              <p className="text-xs text-[#71717A]">
                Anonymized to neighborhood and city level for guest privacy
              </p>
            </div>
            <span className="rounded-full bg-[#FAF9F7] px-3 py-1 text-xs font-medium text-[#52525B]">
              Last {metrics.recentNeighborhoods.length} checks
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#E7E5E4] bg-[#FAF9F7] text-xs font-semibold text-[#71717A]">
                  <th className="px-6 py-3">Neighborhood</th>
                  <th className="px-4 py-3">Nearest Airport</th>
                  <th className="px-4 py-3">Plane Height</th>
                  <th className="px-4 py-3">Night Flights</th>
                  <th className="px-4 py-3">Verdict</th>
                  <th className="px-6 py-3 text-right">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {metrics.recentNeighborhoods.map((row) => {
                  const verdict = getHumanVerdict(row.verdict, row.insideCone, {
                    nightFlights: row.nightFlights,
                    totalDailyMovements: row.totalDailyMovements,
                  });
                  const lateralKm = computeLateralDistanceKm(
                    row.distanceKm,
                    row.angleOffsetDeg
                  );
                  return (
                    <tr key={row.id} className="hover:bg-[#FAF9F7]">
                      <td className="px-6 py-3.5">
                        <div className="font-semibold text-[#18181B]">
                          {row.neighborhoodLabel}
                        </div>
                        <div className="text-xs text-[#71717A]">
                          {row.cityLabel}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-medium text-[#3F3F46]">
                        {row.airportIata} · {row.distanceKm.toFixed(1)} km
                      </td>
                      <td className="px-4 py-3.5 text-xs font-medium text-[#3F3F46]">
                        {row.insideCone
                          ? `~${row.altitudeFeet.toLocaleString()} ft`
                          : `Off path (~${lateralKm.toFixed(1)} km)`}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-medium text-[#3F3F46]">
                        {row.nightFlights} / night
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${verdict.badgeBgClass} ${verdict.badgeTextClass}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${verdict.dotClass}`}
                          />
                          {verdict.badgeLabel}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <Link
                          href={`/audit/${row.id}`}
                          className="text-xs font-semibold text-[#0284C7] hover:underline"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <McpCopyBanner />
      </main>
    </div>
  );
}
