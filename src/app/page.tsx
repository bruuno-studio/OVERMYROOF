import Link from "next/link";
import { AddressLookupForm } from "@/components/AddressLookupForm";
import { FeaturedCorridors } from "@/components/FeaturedCorridors";
import { McpCopyBanner } from "@/components/McpCopyBanner";
import { getFeaturedDemoAudits, isDemoMode } from "@/lib/airnodehub";
import { OVERHEAD_DISCLAIMER } from "@/lib/corridor";

export default function HomePage() {
  const featuredAudits = getFeaturedDemoAudits();
  const demoMode = isDemoMode();

  return (
    <div className="soft-hero-bg min-h-screen">
      {/* Clean Consumer Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-[#E7E5E4]/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F172A] text-white shadow-xs">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
              </svg>
            </span>
            <div>
              <span className="block text-base font-extrabold tracking-tight text-[#18181B]">
                OverMyRoof
              </span>
              <span className="hidden text-[11px] font-medium text-[#71717A] sm:block">
                Flight-path check for stays &amp; rentals
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E5E4] bg-[#FAF9F7] px-3 py-1.5 text-xs font-medium text-[#3F3F46]">
              <span
                className={`h-2 w-2 rounded-full ${
                  demoMode ? "bg-[#D97706]" : "bg-[#16A34A]"
                }`}
              />
              {demoMode ? "Demo Preview" : "Live Flight Data"}
            </span>
            <Link
              href="/metrics"
              className="rounded-full border border-[#E7E5E4] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#3F3F46] transition-colors hover:border-[#0F172A] hover:text-[#0F172A]"
            >
              Live Stats
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-14 px-4 py-12 sm:px-6 sm:py-16">
        {/* Friendly, Clear Consumer Hero */}
        <section className="space-y-7 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#BAE6FD] bg-[#F0F9FF] px-4 py-1.5 text-xs font-semibold text-[#0369A1]">
            For Airbnb guests, hotel travelers &amp; apartment renters
          </div>

          <div className="mx-auto max-w-3xl space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight text-[#18181B] sm:text-5xl sm:leading-[1.1]">
              Will planes wake you up at this Airbnb or hotel?
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-[#52525B] sm:text-lg">
              Listing photos never show the runway three kilometers away. Paste any
              address before you book or sign to see how low jets fly overhead, how
              many pass overnight, and hear what it actually sounds like.
            </p>
          </div>

          {/* Airbnb-style Search Bar */}
          <AddressLookupForm />
        </section>

        {/* Simple 3-Step Visual Explainer */}
        <section
          aria-label="How OverMyRoof works"
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <div className="rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-2xs">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F0F9FF] text-sm font-bold text-[#0284C7]">
              1
            </div>
            <h2 className="mt-3 text-sm font-bold text-[#18181B]">
              Checks exact runway alignment
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#52525B]">
              We map the address against nearby airport runways and calculate
              how low landing or departing jets pass directly above the roof.
            </p>
          </div>

          <div className="rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-2xs">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFFBEB] text-sm font-bold text-[#D97706]">
              2
            </div>
            <h2 className="mt-3 text-sm font-bold text-[#18181B]">
              Counts night flights &amp; wind days
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#52525B]">
              Planes take off and land into the wind. We combine real wind
              history with 11 PM to 6 AM schedules so you know how often noise
              hits.
            </p>
          </div>

          <div className="rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-2xs">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F0FDF4] text-sm font-bold text-[#16A34A]">
              3
            </div>
            <h2 className="mt-3 text-sm font-bold text-[#18181B]">
              Verified proof you can share
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#52525B]">
              Every report is cryptographically signed through API3 AirnodeHub
              so you can message a host, negotiate rent, or warn fellow
              travelers.
            </p>
          </div>
        </section>

        {/* Popular Neighborhood Checks */}
        <FeaturedCorridors audits={featuredAudits} />

        {/* Subtle Developer Footer Hook */}
        <McpCopyBanner />
      </main>

      {/* Clean Light Footer */}
      <footer className="mt-12 border-t border-[#E7E5E4] bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="max-w-2xl text-xs leading-relaxed text-[#71717A]">
            {OVERHEAD_DISCLAIMER}
          </p>
          <span className="shrink-0 text-xs font-semibold text-[#52525B]">
            Verified by API3 AirnodeHub
          </span>
        </div>
      </footer>
    </div>
  );
}
