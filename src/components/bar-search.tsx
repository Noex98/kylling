"use client"

import * as React from "react"
import { cn } from "cn"
import { SearchIcon, XIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import type { Bar } from "@/lib/types"

/**
 * Client-side search over the already-loaded bars. 105 bars is nothing, so we
 * normalise on every keystroke rather than keeping an index around.
 *
 * Danish needs two normalised forms of every string:
 *   "folded"  — æ/ø/å collapse to a/o/a, so "olbaren" and "øl" both hit "Ølbaren"
 *   "digraph" — æ/ø/å expand to ae/oe/aa, so "oe" hits "Ølbaren" and
 *               "aaboulevarden" hits "Åboulevarden"
 * A query matches if either form matches, which covers every way a Dane
 * types on a phone keyboard in the dark.
 */

/** Composed + lowercased, so "å" is one character we can substitute before NFD eats the ring. */
function base(value: string): string {
  return value.normalize("NFC").toLowerCase()
}

/** Drop the remaining combining accents: é → e. */
function strip(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

function folded(value: string): string {
  return strip(
    base(value).replace(/ø/g, "o").replace(/æ/g, "a").replace(/å/g, "a")
  )
}

function digraph(value: string): string {
  return strip(
    base(value).replace(/ø/g, "oe").replace(/æ/g, "ae").replace(/å/g, "aa")
  )
}

/** Does `haystack` (a bar's name + address) contain `query`? */
export function matchesQuery(haystack: string, query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true
  return (
    folded(haystack).includes(folded(trimmed)) ||
    digraph(haystack).includes(digraph(trimmed))
  )
}

/** Everything about a bar that is worth searching. */
export function searchTextOf(bar: Bar): string {
  return [bar.name, bar.address].filter(Boolean).join(" ")
}

export function barMatches(bar: Bar, query: string): boolean {
  return matchesQuery(searchTextOf(bar), query)
}

export function BarSearchField({
  value,
  onChange,
  resultCount,
}: {
  value: string
  onChange: (value: string) => void
  /** Bars matching the search *and* the active chip. Only shown while searching. */
  resultCount: number
}) {
  const active = value.trim().length > 0

  return (
    <div className="space-y-1">
      <div className="relative">
        {/* Lit while it is doing something, so a search left running is
            visible at a glance across a dark table. */}
        <SearchIcon
          className={cn(
            "pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 transition-colors",
            active ? "text-primary" : "text-muted-foreground"
          )}
        />
        <Input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Søg efter bar eller adresse…"
          aria-label="Søg efter bar eller adresse"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-11 rounded-xl pr-11 pl-9 text-base [&::-webkit-search-cancel-button]:hidden"
        />
        {active && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Ryd søgning"
            className="absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:translate-y-[calc(-50%+1px)]"
          >
            <XIcon className="size-5" />
          </button>
        )}
      </div>

      {active && (
        <p aria-live="polite" className="px-1 text-xs text-muted-foreground">
          {resultCount === 0 ? (
            "Ingen barer matcher"
          ) : (
            <>
              <span className="font-semibold text-foreground tabular-nums">
                {resultCount}
              </span>{" "}
              {resultCount === 1 ? "bar" : "barer"} matcher
            </>
          )}
        </p>
      )}
    </div>
  )
}
