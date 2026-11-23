"use client";

import { useState } from "react";
import { AIRNODEHUB_CATALOG } from "@/lib/catalog";

interface McpCopyBannerProps {
  auditId?: string;
}

const MCP_JSON_CONFIG = JSON.stringify(
  {
    mcpServers: {
      airnodehub: {
        url: AIRNODEHUB_CATALOG.mcpUrl,
      },
    },
  },
  null,
  2
);

export function McpCopyBanner({ auditId }: McpCopyBannerProps) {
  const [copiedMode, setCopiedMode] = useState<"url" | "json" | null>(null);

  async function copyValue(mode: "url" | "json") {
    const value =
      mode === "url" ? AIRNODEHUB_CATALOG.mcpUrl : MCP_JSON_CONFIG;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedMode(mode);
      setTimeout(() => setCopiedMode(null), 2000);
      void fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "mcp_config_copy",
          auditId,
          meta: { mode },
        }),
      }).catch(() => {});
    } catch {
      // Clipboard unavailable
    }
  }

  return (
    <section
      aria-label="Developer MCP Endpoint"
      className="rounded-2xl border border-[#E7E5E4] bg-white px-5 py-4 shadow-2xs"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-[#F0F9FF] px-3 py-1 text-[11px] font-bold text-[#0369A1]">
            For Developers
          </span>
          <p className="text-xs text-[#52525B] sm:text-sm">
            Three APIs collided with zero API keys via a single MCP endpoint and x402 micropayments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <code className="font-data rounded-lg border border-[#E7E5E4] bg-[#FAF9F7] px-3 py-1.5 text-xs text-[#18181B]">
            {AIRNODEHUB_CATALOG.mcpUrl}
          </code>
          <button
            type="button"
            onClick={() => void copyValue("url")}
            className="cursor-pointer rounded-lg border border-[#D4D4D8] bg-white px-3 py-1.5 text-xs font-semibold text-[#3F3F46] transition-colors hover:border-[#0F172A] hover:text-[#0F172A]"
          >
            {copiedMode === "url" ? "Copied URL ✓" : "Copy URL"}
          </button>
          <button
            type="button"
            onClick={() => void copyValue("json")}
            className="cursor-pointer rounded-lg bg-[#0F172A] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1E293B]"
          >
            {copiedMode === "json" ? "Copied JSON ✓" : "Copy MCP Config"}
          </button>
        </div>
      </div>
    </section>
  );
}
