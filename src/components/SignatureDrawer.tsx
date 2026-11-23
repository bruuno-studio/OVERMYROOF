"use client";

import { useState } from "react";
import { AIRNODEHUB_CATALOG } from "@/lib/catalog";
import {
  verifyAirnodeAttestation,
  type AttestationVerificationResult,
} from "@/lib/crypto";
import type { AirnodeCallRecord, AuditRecord } from "@/lib/types";

interface SignatureDrawerProps {
  audit: AuditRecord;
}

function getExpectedCatalogAddress(
  provider: AirnodeCallRecord["provider"]
): string {
  switch (provider) {
    case "geoapify":
      return AIRNODEHUB_CATALOG.providers.geoapify.address;
    case "aerodatabox":
      return AIRNODEHUB_CATALOG.providers.aerodatabox.address;
    case "open-meteo":
      return AIRNODEHUB_CATALOG.providers.openMeteo.address;
  }
}

function getFriendlyProviderLabel(call: AirnodeCallRecord): string {
  if (call.provider === "geoapify") return "Address Map (Geoapify)";
  if (call.provider === "open-meteo") return "Wind History (Open-Meteo)";
  if (call.operation === "searchAirportsByLocation")
    return "Nearby Airports (AeroDataBox)";
  if (call.operation === "airportRunways")
    return "Runway Angles (AeroDataBox)";
  if (call.operation === "airportSchedule")
    return "Night Flights (AeroDataBox)";
  return `${call.provider}.${call.operation}`;
}

function formatJsonPreview(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const pretty = JSON.stringify(parsed, null, 2);
    if (pretty.length > 6000) {
      return `${pretty.slice(0, 6000)}\n... [truncated ${pretty.length - 6000} chars for display; full response is hashed during verification]`;
    }
    return pretty;
  } catch {
    return raw.slice(0, 6000);
  }
}

export function SignatureDrawer({ audit }: SignatureDrawerProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [results, setResults] = useState<
    Record<number, AttestationVerificationResult> | null
  >(null);

  const isLiveAudit = audit.mode === "LIVE";

  async function handleVerifyAll() {
    setVerifying(true);
    const nextResults: Record<number, AttestationVerificationResult> = {};

    audit.attestations.forEach((call, idx) => {
      const expectedAirnode = getExpectedCatalogAddress(call.provider);
      nextResults[idx] = verifyAirnodeAttestation({
        operation: call.operation,
        parameters: call.parameters,
        attestation: call.attestation,
        expectedAirnode,
      });
    });

    setResults(nextResults);
    setVerifying(false);

    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "signature_verify",
          auditId: audit.id,
          meta: {
            mode: audit.mode,
            allValid: Object.values(nextResults).every((r) => r.valid),
          },
        }),
      });
    } catch {
      // Non-critical telemetry
    }
  }

  const allLiveVerified =
    results !== null &&
    isLiveAudit &&
    audit.attestations.length > 0 &&
    audit.attestations.every((_, idx) => results[idx]?.valid);

  const selectedCall = audit.attestations[activeIndex] ?? audit.attestations[0];
  const selectedVerification = results ? results[activeIndex] : null;

  return (
    <section className="overflow-hidden rounded-3xl border border-[#E7E5E4] bg-white shadow-xs">
      {/* Clean Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex cursor-pointer items-center gap-3 text-left"
          aria-expanded={open}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E7E5E4] bg-[#FAF9F7] text-sm font-bold text-[#3F3F46]">
            {open ? "−" : "+"}
          </span>
          <div>
            <h2 className="text-base font-bold text-[#18181B]">
              Verify this data yourself ({audit.attestations.length} signed sources)
            </h2>
            <p className="mt-0.5 text-xs text-[#52525B]">
              Inspect raw Geoapify, AeroDataBox, and Open-Meteo responses and check their cryptographic AirnodeHub signatures.
            </p>
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          {allLiveVerified && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-3.5 py-1.5 text-xs font-bold text-[#15803D]">
              ✓ Verified ({audit.attestations.length}/{audit.attestations.length})
            </span>
          )}
          {results !== null && !isLiveAudit && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEF3C7] px-3.5 py-1.5 text-xs font-semibold text-[#B45309]">
              Sample Demo Data
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              void handleVerifyAll();
            }}
            disabled={verifying}
            className="cursor-pointer rounded-xl bg-[#16A34A] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#15803D] disabled:opacity-60"
          >
            {verifying ? "Verifying..." : "Verify Signatures"}
          </button>
        </div>
      </div>

      {open && selectedCall && (
        <div className="border-t border-[#E7E5E4] bg-[#FAF9F7] p-6">
          {/* Source Pill Tabs */}
          <div className="flex flex-wrap gap-2">
            {audit.attestations.map((call, idx) => {
              const res = results ? results[idx] : null;
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={`${call.provider}-${call.operation}-${idx}`}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  className={`flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    isSelected
                      ? "bg-[#0F172A] text-white"
                      : "border border-[#E7E5E4] bg-white text-[#52525B] hover:border-[#0F172A]"
                  }`}
                >
                  <span>{getFriendlyProviderLabel(call)}</span>
                  {res && (
                    <span
                      className={`h-2 w-2 rounded-full ${
                        res.valid
                          ? "bg-[#22C55E]"
                          : call.mode === "DEMO"
                            ? "bg-[#F59E0B]"
                            : "bg-[#EF4444]"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Call Verification Metadata */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[#E7E5E4] bg-white p-3.5">
              <div className="text-[11px] font-medium text-[#71717A]">
                Airnode Signer Address
              </div>
              <div className="font-data mt-1 break-all text-xs text-[#18181B]">
                {selectedCall.attestation.airnode}
              </div>
            </div>

            <div className="rounded-xl border border-[#E7E5E4] bg-white p-3.5">
              <div className="text-[11px] font-medium text-[#71717A]">
                Timestamp (UTC) &amp; x402 Cost
              </div>
              <div className="font-data mt-1 text-xs text-[#18181B]">
                {new Date(
                  Number(selectedCall.attestation.timestamp) * 1000
                ).toISOString()}{" "}
                ·{" "}
                {selectedCall.priceUsd === 0
                  ? "Free ($0.00)"
                  : `$${selectedCall.priceUsd.toFixed(2)} aUSD`}
              </div>
            </div>

            <div className="rounded-xl border border-[#E7E5E4] bg-white p-3.5">
              <div className="text-[11px] font-medium text-[#71717A]">
                Canonical Request Hash
              </div>
              <div className="font-data mt-1 break-all text-[11px] text-[#52525B]">
                {selectedCall.attestation.requestHash}
              </div>
            </div>

            <div className="rounded-xl border border-[#E7E5E4] bg-white p-3.5">
              <div className="text-[11px] font-medium text-[#71717A]">
                EIP-191 Cryptographic Signature
              </div>
              <div className="font-data mt-1 break-all text-[11px] text-[#52525B]">
                {selectedCall.attestation.signature}
              </div>
            </div>
          </div>

          {selectedCall.settlementTx && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E7E5E4] bg-white px-4 py-2.5 text-xs text-[#52525B]">
              <span className="font-data break-all">
                x402 Settlement Tx: {selectedCall.settlementTx}
              </span>
              {selectedCall.settlementTx.startsWith("0x") && (
                <a
                  href={`https://sepolia.basescan.org/tx/${selectedCall.settlementTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 font-semibold text-[#0284C7] hover:underline"
                >
                  View on BaseScan ↗
                </a>
              )}
            </div>
          )}

          {/* Client-Side Verification Banner */}
          {selectedVerification && (
            <div
              className={`mt-3 rounded-xl border px-4 py-3 text-xs ${
                selectedVerification.valid
                  ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]"
                  : selectedCall.mode === "DEMO"
                    ? "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]"
                    : "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"
              }`}
            >
              {selectedVerification.valid ? (
                <div>
                  <div className="font-bold">
                    VERIFIED · Cryptographic EIP-191 signature confirmed directly in your browser
                  </div>
                  <div className="font-data mt-1 text-[11px]">
                    Recovered Signer: {selectedVerification.recoveredAddress}
                  </div>
                </div>
              ) : selectedCall.mode === "DEMO" ? (
                <div>
                  This is one of the instant sample reports. Search any live address on the home page to generate and verify fresh on-chain AirnodeHub signatures.
                </div>
              ) : (
                <div>
                  Verification failed: {selectedVerification.reason}
                </div>
              )}
            </div>
          )}

          {/* Raw Upstream JSON */}
          <div className="mt-4 overflow-hidden rounded-xl border border-[#E7E5E4] bg-white">
            <div className="flex items-center justify-between border-b border-[#E7E5E4] bg-[#F8FAFC] px-4 py-2 text-[11px] font-medium text-[#52525B]">
              <span>
                Raw signed data payload ({selectedCall.attestation.data.length.toLocaleString()} bytes)
              </span>
              <span className="font-data text-[#71717A]">
                {selectedCall.endpoint}
              </span>
            </div>
            <pre className="font-data max-h-64 overflow-auto bg-[#0F172A] p-4 text-[11px] leading-relaxed text-[#E2E8F0]">
              {formatJsonPreview(selectedCall.attestation.data)}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
