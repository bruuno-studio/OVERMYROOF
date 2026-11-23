import Link from "next/link";

export default function NotFound() {
  return (
    <div className="soft-hero-bg flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
      <div className="w-full max-w-md rounded-3xl border border-[#E7E5E4] bg-white p-8 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F0F9FF] text-[#0284C7]">
          <svg
            className="h-6 w-6"
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
        </div>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-[#18181B]">
          Flight-path report not found
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#52525B]">
          This report link may have expired or the address ID is invalid. Run a
          fresh airspace check in seconds to see live runway paths, altitude,
          and overnight flights.
        </p>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-[#0F172A] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1E293B]"
          >
            Check an Address
          </Link>
          <Link
            href="/audit/lhr-hounslow"
            className="inline-flex items-center justify-center rounded-xl border border-[#D4D4D8] bg-white px-5 py-2.5 text-sm font-semibold text-[#18181B] transition-colors hover:border-[#0F172A]"
          >
            View Sample Report
          </Link>
        </div>
      </div>
    </div>
  );
}
