# OverMyRoof — Overhead Flight-Path & Airspace Audit

**Check whether an Airbnb, hotel, or apartment sits directly under an airport landing or takeoff corridor before you book or sign.**

OverMyRoof collides **address geocoding**, **live aviation runway & schedule telemetry**, and **90-day historical wind climatology** through **[API3 AirnodeHub](https://airnodehub.api3.org)** (zero API keys, pay-per-call x402 `aUSD` micropayments, EIP-191 cryptographically signed first-party responses) to generate a shareable, verifiable **Overhead Flight-Path Report**.

---

## Features

- **Interactive Zero-API-Key Street Map (`FlightPathMap`)**: True Web Mercator north-up map using free Esri World Topo (`Clean`) and OpenStreetMap (`Street Labels`) tiles with automatic failover, interactive pan/zoom/recenter controls, 8 km / 16 km runway cones, and a side-view altitude & lateral clearance diagram.
- **Consumer-Friendly Noise & Sleep Verdict**: Translates glideslope altitude, peak outdoor dB, closed double-glazed indoor dB (`~−22 dB`), prevailing wind frequency, and airport-wide late-night flights (`11 PM–6 AM`) into plain-English takeaways.
- **Realistic Flyover Audio Simulator**: Pure **Web Audio API** jet Doppler sweep (zero external audio files) with a **Windows Open (Outdoor) vs. Closed Double-Glazed (~−22 dB)** filter toggle plus voice summary readout (optional TTS proxy with Web Speech fallback).
- **Ready-to-Send Host & Landlord Messages**: Verdict-aware message templates tailored for Airbnb/hotel hosts, rent negotiation, or bedroom window glazing inquiries.
- **Browser-Side High-Res PNG Export & X Sharing**: Generates custom `2400×1260` (2× retina `1200×630`) report PNGs directly on HTML5 `<canvas>` (**0 ms server CPU**) alongside instant `x.com/intent/post` sharing and `< 1 ms` static OG cards.
- **Client-Side Cryptographic Verification**: Inspect raw Geoapify, AeroDataBox, and Open-Meteo payloads and verify every AirnodeHub EIP-191 secp256k1 signature directly in the browser.
- **Live Funnel Telemetry (`/metrics`)**: Tracks real checks, live AirnodeHub API calls & `aUSD` spend, X shares, PNG downloads, simulator plays, host message copies, and developer MCP config copies.

---

## Architecture & Cloudflare Workers Free Plan (`$0/month`)

Built with **Next.js App Router (via [vinext](https://github.com/cloudflare/vinext)) + TypeScript + Tailwind CSS**, engineered specifically to stay comfortably inside **Cloudflare Workers Free Plan** limits (`10 ms` CPU time per request, `100,000` Worker requests/day, unlimited static assets):

- **Zero server-side WASM**: No `@vercel/og` or heavy font/image rendering inside the Worker (`~1.27 MiB` raw / `~382 KiB` gzipped bundle).
- **CDN-First Static Assets**: Static OG previews (`/og/*`), favicons (`/favicon.*`), and `_next/static/*` bypass the Worker completely via `run_worker_first` exclusions (**0 ms CPU, 0 Worker requests**).
- **Smart Cost Controls**:
  - Live autocomplete (`/api/autocomplete`) uses AirnodeHub's **free** (`$0.00`) Geoapify operation.
  - Daily query cache + ~150 m (precision-7) geohash cache prevents redundant paid calls for the same street/neighborhood.
  - Remote locations (`> 25 km` from any commercial airport) skip the `$0.10` Open-Meteo call automatically.
  - Server-side burner wallet executes x402 EIP-3009 settlements on Base Sepolia (`eip155:84532`)—end users never connect a crypto wallet.

### Verified AirnodeHub Endpoints Used

| Provider | Base URL | Operations Used | x402 Cost (`aUSD`) | Airnode Signer |
| --- | --- | --- | --- | --- |
| **Geoapify** | `https://airnodes.api3.org/geoapify` | `autocomplete`, `geocode` | `$0.00` (Free) | `0xe02BEaC10Add5037daa0FF6BCACB13360bd4185D` |
| **AeroDataBox** | `https://airnodes.api3.org/aerodatabox` | `searchAirportsByLocation`, `airportRunways`, `airportSchedule` | `$0.05` / `$0.02` / `$0.05` | `0x83FE2E8F24E66520B1902C3507De4F471248f2Ec` |
| **Open-Meteo** | `https://airnodes.api3.org/open-meteo` | `historicalWeather` (90-day wind) | `$0.10` | `0xee510FFb986299529fE987bfD163D6c89067D767` |

**MCP Endpoint for AI Agents & Developers:** `https://airnodehub.api3.org/mcp`

---

## Aviation & Acoustic Methodology

- **Runway Alignment**: Computes Haversine distance and true compass bearing from nearby commercial airport runways (live AeroDataBox runway geometry with a 125+ global hub fallback table). Addresses within `16 km` and `±12°` of an extended runway centerline fall inside the active flight cone.
- **Altitude Estimation**: Uses standard **3° ILS landing glideslope** for approach corridors and **~6.2° commercial jet climb gradient** for departure corridors.
- **Wind Exposure**: Evaluates 90 days of daily dominant wind direction (aircraft land and take off *into* the wind within `±60°` of runway heading).
- **Noise & Traffic Thresholds**: Peak outdoor dB is modeled from distance, lateral offset, altitude, and departure climb thrust (`+3 dB`), with indoor closed double-glazed estimation (`−22 dB`). Heavy-traffic red alerts require real scheduled airport flight volume so low-traffic regional airfields are never mislabeled as heavy jet corridors.
- **Scope**: Estimates cover **overhead commercial aviation only** and do not measure street-level traffic, sirens, or local building noise.

---

## Security Hardening

- **Zero Exposed Secrets**: `AIRNODEHUB_WALLET_PRIVATE_KEY` is read strictly server-side from Cloudflare Secrets (`.env.local` and `.dev.vars` are gitignored).
- **Scoped IP Rate Limiting**:
  - `POST /api/audit-address`: `10` fresh live audits/hour per IP (cache hits do not burn quota; `1 KB` body cap; control-char sanitization; sanitized error messages).
  - `GET /api/autocomplete`: `60` requests/minute per IP with in-memory TTL cache.
  - `POST /api/events`: `60` requests/minute per IP, `2 KB` body cap, strict metadata key/value sanitization, and `audit_generated` restricted to server-only writes.
  - `POST /api/voice`: `20` requests/hour per IP when optional `TTS_API_KEY` is enabled.
- **HTTP Security Headers** ([next.config.ts](next.config.ts) & [public/_headers](public/_headers)): Strict `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and `Strict-Transport-Security`.
- **Safe ID Validation**: All audit ID lookups enforce strict regex validation (`^[a-z0-9][a-z0-9_-]{1,62}$`) before hitting storage.

---

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

- Runs safely in **Demo Mode** out of the box with zero wallet/secrets configured (5 pre-built global corridors: London Heathrow `LHR`, Los Angeles `LAX`, Istanbul Sabiha Gökçen `SAW`, New York LaGuardia `LGA`, and Hampstead quiet baseline).
- To enable **Live AirnodeHub x402** calls locally, add your Base Sepolia testnet burner key to `.dev.vars` (or `.env.local`):

```dotenv
DEMO_MODE=false
AIRNODEHUB_WALLET_PRIVATE_KEY=0x...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start local Vite / Cloudflare Worker dev server |
| `npm run build` | Build RSC, SSR, and static client bundles into `dist/` |
| `npm run start` | Preview the production Cloudflare Worker locally |
| `npm run deploy` | Build and deploy via Wrangler CLI |

---

## Deploying to Cloudflare Workers Free Plan (via GitHub)

1. Push this repository to GitHub (`.env.local` and `.dev.vars` are automatically excluded by `.gitignore`).
2. In **Cloudflare Dashboard → Workers & Pages → Create → Workers → Connect to Git**, select your repository:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Root directory:** `/`
3. Configure **Settings → Variables and Secrets** on your Worker:
   - `AIRNODEHUB_WALLET_PRIVATE_KEY` (**Secret / Encrypted**): Your funded Base Sepolia `aUSD` burner wallet private key. Once present, OverMyRoof automatically switches to Live Flight Data (set `DEMO_MODE=true` anytime in Variables to pause live calls without redeploying; `keep_vars: true` in `wrangler.jsonc` preserves dashboard variables across Git pushes).
   - `NEXT_PUBLIC_SITE_URL` (**Text**, set in both Build & Runtime variables): Your live URL (e.g. `https://overmyroof.<subdomain>.workers.dev` or custom domain) so X/WhatsApp cards resolve cleanly.
4. *(Optional, `$0` Free Plan)* **Persistent Storage (Cloudflare KV)**:
   - Create a free KV namespace in Cloudflare Dashboard and bind it under **Worker → Settings → Bindings** as **`OVERMYROOF_KV`**.
   - Without KV, reports work immediately using isolate memory; with `OVERMYROOF_KV`, shared `/audit/[id]` links, geohash cache, IP rate limits, and `/metrics` history persist reliably across Worker cold starts (Free plan includes `1 GB` storage, `100,000` reads/day, `1,000` writes/day).
