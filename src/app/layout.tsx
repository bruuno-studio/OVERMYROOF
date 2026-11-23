import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans-app",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-app",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "OverMyRoof — Check Airplane Noise Before You Book or Sign",
  description:
    "Check whether an Airbnb, hotel, or apartment sits under an airport flight path. See how low planes fly, how many pass overnight, and hear a realistic flyover before you book.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "OverMyRoof — Will Planes Wake You Up at This Stay?",
    description:
      "Enter any street address, hotel, or Airbnb neighborhood to see verified flight-path altitude, overnight jets, and wind patterns.",
    type: "website",
    images: [
      {
        url: "/api/og/default",
        width: 1200,
        height: 630,
        alt: "OverMyRoof Flight Path & Overhead Noise Report",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OverMyRoof — Check Airplane Noise Before You Book",
    description:
      "Verify whether an Airbnb, hotel, or apartment sits under an airport landing or takeoff corridor with signed aviation telemetry.",
    images: ["/api/og/default"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${jetBrainsMono.variable}`}
    >
      <body className="min-h-screen bg-[#FAF9F7] text-[#18181B] antialiased selection:bg-[#0F172A] selection:text-white">
        {children}
      </body>
    </html>
  );
}
