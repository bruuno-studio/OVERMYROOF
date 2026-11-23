import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlyoverSimulator } from "@/components/FlyoverSimulator";
import { InspectionSlipCard } from "@/components/InspectionSlipCard";
import { McpCopyBanner } from "@/components/McpCopyBanner";
import { SignatureDrawer } from "@/components/SignatureDrawer";
import { buildPlainSummary, getHumanVerdict } from "@/lib/humanCopy";
import { getAuditById } from "@/lib/storage";

interface AuditPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: AuditPageProps): Promise<Metadata> {
  const { id } = await params;
  const audit = await getAuditById(id);

  if (!audit) {
    return {
      title: "Report Not Found | OverMyRoof",
    };
  }

  const { analysis } = audit;
  const verdict = getHumanVerdict(analysis.verdict, analysis.insideCone, {
    nightFlights: analysis.nightFlights,
    totalDailyMovements: analysis.totalDailyMovements,
  });
  const title = `${audit.neighborhoodLabel} — ${verdict.badgeLabel} (${analysis.airportIata}) | OverMyRoof`;
  const description = buildPlainSummary(analysis);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: [
        {
          url: `/api/og/${encodeURIComponent(audit.id)}`,
          width: 1200,
          height: 630,
          alt: `OverMyRoof Flight-Path Report for ${audit.formattedAddress}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/api/og/${encodeURIComponent(audit.id)}`],
    },
  };
}

export default async function AuditDetailPage({ params }: AuditPageProps) {
  const { id } = await params;
  const audit = await getAuditById(id);

  if (!audit) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      {/* Clean Light Sticky Header */}
      <header className="sticky top-0 z-30 border-b border-[#E7E5E4]/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E5E4] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#3F3F46] transition-colors hover:border-[#0F172A] hover:text-[#0F172A]"
            >
              ← Check another address
            </Link>
            <Link
              href="/"
              className="hidden text-sm font-extrabold tracking-tight text-[#18181B] sm:inline"
            >
              OverMyRoof
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E5E4] bg-[#FAF9F7] px-3 py-1 text-xs font-medium text-[#52525B]">
              <span
                className={`h-2 w-2 rounded-full ${
                  audit.mode === "LIVE" ? "bg-[#16A34A]" : "bg-[#D97706]"
                }`}
              />
              {audit.mode === "LIVE" ? "Live Verified Data" : "Sample Report"}
            </span>
            <Link
              href="/metrics"
              className="rounded-full border border-[#E7E5E4] bg-white px-3 py-1 text-xs font-semibold text-[#3F3F46] transition-colors hover:border-[#0F172A] hover:text-[#0F172A]"
            >
              Live Stats
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        {/* 1. Plain-English Flight-Path Report Card + Map + Actions */}
        <InspectionSlipCard audit={audit} />

        {/* 2. Interactive Sound Preview */}
        <FlyoverSimulator audit={audit} />

        {/* 3. Cryptographic Proof & Raw Data Drawer */}
        <SignatureDrawer audit={audit} />

        {/* 4. Subtle Developer MCP Card */}
        <McpCopyBanner auditId={audit.id} />
      </main>
    </div>
  );
}
