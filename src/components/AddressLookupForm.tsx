"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

interface AutocompleteSuggestion {
  label: string;
  primary: string;
  secondary: string;
  lat: number;
  lon: number;
  countryCode: string;
  resultType: string;
}

const QUICK_EXAMPLES = [
  { label: "Bağlar, Eskişehir", query: "Yenibağlar Mahallesi, Tepebaşı, Eskişehir, Turkey" },
  { label: "Pendik (SAW), İstanbul", query: "Yayalar Mahallesi, Pendik, Istanbul, Turkey" },
  { label: "Hounslow West, London", query: "Hounslow West, London" },
  { label: "Astoria, Queens NY", query: "23-15 Ditmars Blvd, Queens, NY" },
  { label: "El Segundo, LAX", query: "420 W Imperial Ave, El Segundo, CA" },
];

export function AddressLookupForm() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const skipNextFetchRef = useRef(false);
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [fetchingSuggestions, setFetchingSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Debounced live autocomplete via FREE AirnodeHub Geoapify endpoint
  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    const trimmed = address.trim();
    if (trimmed.length < 2 || loading) {
      setSuggestions([]);
      setFetchingSuggestions(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setFetchingSuggestions(true);
      try {
        const res = await fetch(
          `/api/autocomplete?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          suggestions?: AutocompleteSuggestion[];
        };
        const items = data.suggestions ?? [];
        setSuggestions(items);
        setActiveIndex(-1);
        setDropdownOpen(items.length > 0);
      } catch {
        // Ignore aborted fetches
      } finally {
        setFetchingSuggestions(false);
      }
    }, 260);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [address, loading]);

  async function submitAddress(targetAddress: string) {
    const trimmed = targetAddress.trim();
    if (trimmed.length < 3) {
      setError("Please enter a street address, hotel name, or neighborhood.");
      return;
    }

    setDropdownOpen(false);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/audit-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: trimmed }),
      });

      const payload = (await response.json()) as {
        id?: string;
        url?: string;
        error?: string;
      };

      if (!response.ok || !payload.url) {
        setError(
          payload.error ||
            "Could not check that address right now. Please try selecting one of the suggestions."
        );
        setLoading(false);
        return;
      }

      router.push(payload.url);
    } catch {
      setError("Network error while checking live flight paths. Please try again.");
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dropdownOpen && activeIndex >= 0 && suggestions[activeIndex]) {
      const chosen = suggestions[activeIndex];
      skipNextFetchRef.current = true;
      setAddress(chosen.label);
      void submitAddress(chosen.label);
      return;
    }
    void submitAddress(address);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1
      );
    } else if (event.key === "Escape") {
      setDropdownOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-3xl">
      <form
        onSubmit={handleSubmit}
        className="rounded-3xl border border-[#E7E5E4] bg-white p-2.5 shadow-[0_12px_36px_-12px_rgba(15,23,42,0.10)] transition-shadow focus-within:border-[#CBD5E1] focus-within:shadow-[0_16px_42px_-12px_rgba(15,23,42,0.16)]"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-3 px-4 py-2 text-left">
            {fetchingSuggestions ? (
              <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[#CBD5E1] border-t-[#0284C7]" />
            ) : (
              <svg
                className="h-5 w-5 shrink-0 text-[#71717A]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            )}
            <div className="flex-1">
              <label
                htmlFor="overmyroof-address"
                className="block text-[11px] font-semibold text-[#71717A]"
              >
                Airbnb area, hotel name, or street address (worldwide)
              </label>
              <input
                id="overmyroof-address"
                name="address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onFocus={() => {
                  if (suggestions.length > 0) setDropdownOpen(true);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Start typing... e.g. Eskişehir, Pendik, Astoria NY, Heathrow"
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={dropdownOpen}
                disabled={loading}
                className="mt-0.5 w-full bg-transparent text-base font-medium text-[#18181B] placeholder:font-normal placeholder:text-[#A1A1AA] focus:outline-none disabled:opacity-60"
              />
            </div>
            {address.length > 0 && !loading && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setAddress("");
                  setSuggestions([]);
                  setDropdownOpen(false);
                  setError(null);
                }}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-sm font-bold text-[#71717A] transition-colors hover:bg-[#F4F4F5] hover:text-[#18181B]"
              >
                ×
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-14 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#0F172A] px-7 text-sm font-semibold text-white transition-all hover:bg-[#1E293B] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Checking Skies...
              </>
            ) : (
              "Check Flight Path"
            )}
          </button>
        </div>
      </form>

      {/* Live Autocomplete Dropdown */}
      {dropdownOpen && suggestions.length > 0 && !loading && (
        <ul
          role="listbox"
          aria-label="Address suggestions"
          className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-2xl border border-[#E7E5E4] bg-white text-left shadow-xl"
        >
          {suggestions.map((item, idx) => {
            const isActive = idx === activeIndex;
            return (
              <li key={`${item.label}-${idx}`} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    skipNextFetchRef.current = true;
                    setAddress(item.label);
                    setDropdownOpen(false);
                    void submitAddress(item.label);
                  }}
                  className={`flex w-full cursor-pointer items-center justify-between gap-3 border-b border-[#F4F4F5] px-4 py-3 text-left transition-colors last:border-b-0 ${
                    isActive ? "bg-[#F0F9FF]" : "hover:bg-[#FAF9F7]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FAF9F7] text-[#52525B] ring-1 ring-[#E7E5E4]">
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#18181B]">
                        {item.primary}
                      </div>
                      {item.secondary && (
                        <div className="truncate text-xs text-[#71717A]">
                          {item.secondary}
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="shrink-0 rounded-full bg-[#FAF9F7] px-2.5 py-1 text-[11px] font-medium text-[#52525B] ring-1 ring-[#E7E5E4]">
                    {item.resultType}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-left text-sm font-medium text-[#B91C1C]"
        >
          {error}
        </div>
      )}

      {/* Friendly quick-try chips */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs font-medium text-[#71717A]">
          Try an example:
        </span>
        {QUICK_EXAMPLES.map((sample) => (
          <button
            key={sample.query}
            type="button"
            disabled={loading}
            onClick={() => {
              skipNextFetchRef.current = true;
              setAddress(sample.query);
              void submitAddress(sample.query);
            }}
            className="cursor-pointer rounded-full border border-[#E7E5E4] bg-white px-3.5 py-1.5 text-xs font-medium text-[#3F3F46] shadow-2xs transition-colors hover:border-[#0F172A] hover:text-[#0F172A] disabled:opacity-60"
          >
            {sample.label}
          </button>
        ))}
      </div>
    </div>
  );
}
