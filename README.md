# OverMyRoof

**Will planes wake you up at this Airbnb, hotel, or apartment?**

Listing photos never show the runway three kilometers away. **OverMyRoof** lets travelers, renters, and homebuyers check any street address worldwide to see whether it sits under an airport landing or takeoff corridor—before booking or signing a lease.

**[Try OverMyRoof Live →](https://overmyroof.barisyilmazcontact.workers.dev)** · **[Live Stats →](https://overmyroof.barisyilmazcontact.workers.dev/metrics)**

---

## What It Does

Enter any street address, neighborhood, or hotel name and get an instant, shareable **Overhead Flight-Path Report**:

- **Interactive Flight-Path Map** — See the exact runway alignment, active approach and departure cones, and a side-view altitude or lateral clearance profile on real street maps.
- **Plain-English Sleep & Noise Verdict** — Instantly understand peak outdoor noise, estimated closed-window indoor volume, how low planes pass overhead, how often wind routes flights over the roof, and scheduled late-night traffic (`11 PM–6 AM`).
- **Realistic Flyover Sound Preview** — Listen to a simulated jet pass tuned to the address with an **Open Window vs. Closed Double-Glazed Window** switch and spoken summary.
- **Ready-to-Send Host & Landlord Messages** — Copy a polite, data-backed message asking about bedroom glazing, requesting a quieter room, or negotiating rent.
- **Shareable Report Card** — Export a high-resolution PNG slip, copy the permanent report link, or share directly on X.
- **Built-In Cryptographic Verification** — Expand any live report to inspect the raw upstream responses and verify their first-party **API3 AirnodeHub** signatures directly in your browser.

---

## Powered by API3 AirnodeHub

OverMyRoof showcases cross-domain real-world data collision powered by **[API3 AirnodeHub](https://airnodehub.api3.org)**—with **zero API keys**, **pay-per-call x402 micropayments**, and **cryptographically signed responses** (with zero wallet friction for end users):

- **Geoapify** — Global address autocomplete & geocoding
- **AeroDataBox** — Nearby commercial airports, runway geometry & overnight flight schedules
- **Open-Meteo** — Historical prevailing wind patterns

Building your own app or AI agent with the same data sources? Connect directly via the AirnodeHub MCP endpoint:

```text
https://airnodehub.api3.org/mcp
```

---

## Tech Stack

- **Next.js App Router** (via `vinext`) · **TypeScript** · **Tailwind CSS**
- **Cloudflare Workers** & **Workers KV** for global edge delivery and persistent report links
- **Web Audio API** for client-side jet flyover sound synthesis
- **API3 AirnodeHub** (x402 settlements + EIP-191 attestation verification)

---

## Running Locally

```bash
npm install
npm run dev
```

Runs out of the box with built-in global sample reports (London Heathrow `LHR`, Los Angeles `LAX`, Istanbul Sabiha Gökçen `SAW`, New York LaGuardia `LGA`, and a quiet London baseline).

---

*Note: OverMyRoof reports estimate overhead commercial aviation exposure only and do not measure street-level traffic or local building noise.*
