import { env } from "cloudflare:workers";

interface AssetsFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/**
 * Cloudflare Workers Free-Tier Safe OG Image (< 1 ms CPU, zero WASM).
 * Serves pre-rendered 1200x630 PNG from Cloudflare Static ASSETS.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const assetUrl = new URL("/og/default.png", origin);

  try {
    const assets = (env as unknown as { ASSETS?: AssetsFetcher })?.ASSETS;
    if (assets && typeof assets.fetch === "function") {
      const res = await assets.fetch(new Request(assetUrl));
      if (res.ok) {
        return new Response(res.body, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }
  } catch {
    // Fallback to redirect
  }

  return Response.redirect(assetUrl.toString(), 302);
}
