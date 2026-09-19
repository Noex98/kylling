"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { cn } from "cn"
import { ListIcon, MapIcon } from "lucide-react"

import { AddBarDialog } from "@/components/add-bar-dialog"
import { BarCard } from "@/components/bar-card"
import { barMatches, BarSearchField } from "@/components/bar-search"
import { SyncIndicator } from "@/components/sync-indicator"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useGameState } from "@/components/use-game-state"
import { getOpenState, type OpenState } from "@/lib/hours"
import type { Bar, Visit } from "@/lib/types"

/** Leaflet reaches for `window`, so the map may only load in the browser. */
const BarMap = dynamic(
  () => import("@/components/bar-map").then((m) => m.BarMap),
  {
    ssr: false,
    loading: () => (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Henter kort… 🗺️
      </p>
    ),
  }
)

const FILTERS = [
  { id: "alle", label: "Alle" },
  { id: "mangler", label: "Mangler" },
  { id: "besoegt", label: "Besøgt" },
] as const

type Filter = (typeof FILTERS)[number]["id"]

type Row = { bar: Bar; visit?: Visit; status: OpenState; pending: boolean }

type Tab = "liste" | "kort"

/**
 * The map has to fill exactly what is left below the sticky header — measure it
 * rather than guess, since the header grows with the search result line.
 *
 * A callback ref rather than an effect, because the header only mounts once the
 * first load has resolved: an effect with an empty dependency list would run
 * against a ref that is still null and never measure anything.
 */
function useHeaderHeight(): [(node: HTMLElement | null) => void, number] {
  const [height, setHeight] = React.useState(0)

  const ref = React.useCallback((node: HTMLElement | null) => {
    if (!node) return
    const update = () => setHeight(node.getBoundingClientRect().height)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, height]
}

const TEAM_NAME = "De tørstige slagtere"

/** How long the first-load cover takes to fade away. */
const FADE_MS = 400

const LOADER_CSS = `
@keyframes kylling-bob {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-7%) scale(1.06); }
}
.kylling-loader-emoji {
  animation: kylling-bob 1.5s ease-in-out infinite;
  filter: drop-shadow(0 14px 28px rgba(0, 0, 0, 0.55));
}
@media (prefers-reduced-motion: reduce) {
  .kylling-loader-emoji { animation: none; }
}
`

/**
 * Covers the whole app until the first fetch has resolved, then fades away and
 * unmounts for good. It is driven purely by the query's first resolution, so it
 * can never uncover an empty screen — and because it unmounts after one fade,
 * the five-second poll can never bring it back mid-game.
 */
function FirstLoadOverlay({ resolved }: { resolved: boolean }) {
  const [mounted, setMounted] = React.useState(true)
  const [fading, setFading] = React.useState(false)

  React.useEffect(() => {
    if (!resolved) return
    // One frame first, so the app underneath has painted before we uncover it.
    const frame = requestAnimationFrame(() => setFading(true))
    // `transitionend` normally does the unmounting; this is the fallback for
    // when it never fires (a backgrounded tab, a cancelled transition).
    const timer = setTimeout(() => setMounted(false), FADE_MS + 250)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [resolved])

  if (!mounted) return null

  return (
    <div
      role="status"
      aria-busy={!resolved}
      onTransitionEnd={(event) => {
        if (event.propertyName === "opacity") setMounted(false)
      }}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background transition-opacity ease-out",
        fading && "pointer-events-none opacity-0"
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <style>{LOADER_CSS}</style>
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        <span
          aria-hidden
          className="kylling-loader-emoji text-[clamp(5rem,30vw,10rem)] leading-none select-none"
        >
          🐔
        </span>
        <p className="font-heading text-lg font-bold tracking-tight text-balance">
          {TEAM_NAME}
        </p>
      </div>
      <span className="sr-only">Henter barer…</span>
    </div>
  )
}

/** Shown instead of the app when the very first load never got through. */
function FirstLoadError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <span aria-hidden className="text-6xl leading-none">
        🐔
      </span>
      <h1 className="font-heading text-xl font-bold tracking-tight">
        Kunne ikke hente barerne
      </h1>
      <p className="text-sm break-words text-muted-foreground">{message}</p>
      <Button size="lg" className="h-12 px-6 text-base" onClick={onRetry}>
        Prøv igen
      </Button>
    </main>
  )
}

/**
 * Open and unvisited first, then whatever opens soonest, then the hopeless
 * ones, and finally everything already ticked off.
 */
function rankOf(row: Row): number {
  if (row.visit) return 3
  if (row.status.isOpen) return 0
  if (row.status.opensAt) return 1
  return 2
}

function sortKeyOf(row: Row): number {
  if (row.visit) return -Date.parse(row.visit.at)
  if (row.status.isOpen) return row.status.closesAt?.getTime() ?? 0
  return row.status.opensAt?.getTime() ?? 0
}

function compareRows(a: Row, b: Row): number {
  const byRank = rankOf(a) - rankOf(b)
  if (byRank !== 0) return byRank
  const byKey = sortKeyOf(a) - sortKeyOf(b)
  if (byKey !== 0) return byKey
  return a.bar.name.localeCompare(b.bar.name, "da")
}

export default function Home() {
  const {
    state,
    now,
    error,
    ready,
    refresh,
    toggleVisit,
    addBar,
    deleteBar,
    togglingBars,
    deletingBars,
  } = useGameState()
  const [filter, setFilter] = React.useState<Filter>("alle")
  const [query, setQuery] = React.useState("")
  const [tab, setTab] = React.useState<Tab>("liste")
  const [headerRef, headerHeight] = useHeaderHeight()

  const rows = React.useMemo<Row[]>(() => {
    if (!state || !now) return []
    return state.bars
      .map((bar) => ({
        bar,
        visit: state.visits[bar.id],
        status: getOpenState(bar.hours, now),
        pending: togglingBars.has(bar.id),
      }))
      .sort(compareRows)
  }, [state, now, togglingBars])

  // Progress is about the whole crawl, so it ignores the search.
  const total = rows.length
  const visited = rows.filter((r) => r.visit).length

  // The chips count what is left after the search — they compose, not compete.
  const searched = React.useMemo(
    () => rows.filter((row) => barMatches(row.bar, query)),
    [rows, query]
  )

  const counts: Record<Filter, number> = {
    alle: searched.length,
    mangler: searched.filter((r) => !r.visit).length,
    besoegt: searched.filter((r) => r.visit).length,
  }

  const shown = searched.filter((row) => {
    if (filter === "mangler") return !row.visit
    if (filter === "besoegt") return Boolean(row.visit)
    return true
  })

  function handleToggle(bar: Bar, next: boolean) {
    // The "krydset af" toast is fired by the mutation once the server has
    // actually accepted it — nothing here is optimistic any more.
    toggleVisit(bar.id, next)
  }

  function handleDelete(bar: Bar) {
    if (!window.confirm(`Slet "${bar.name}"?`)) return
    deleteBar(bar.id)
  }

  // The first load either produced state or failed outright; either way the
  // cover may come off. Later failures keep the app on screen with a banner.
  const firstLoadFailed = state === null && error !== null

  return (
    <>
      <FirstLoadOverlay resolved={ready || firstLoadFailed} />

      {/* Nothing of the app is rendered until it can be rendered complete —
          the cover then fades off a finished screen, not a half-built one. */}
      {state !== null && now !== null ? (
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
          className="min-h-dvh gap-0 bg-background"
        >
          <header
            ref={headerRef}
            className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur-md"
          >
            <div className="mx-auto w-full max-w-lg space-y-3 px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h1 className="font-heading text-xl leading-tight font-bold tracking-tight">
                    Kylling 🐔
                  </h1>
                  <p className="truncate text-xs text-muted-foreground">
                    {TEAM_NAME}
                  </p>
                </div>
                <SyncIndicator className="mt-1" />
              </div>

              <Progress visited={visited} total={total} />

              <BarSearchField
                value={query}
                onChange={setQuery}
                resultCount={shown.length}
              />

              <TabsList className="grid h-11! w-full grid-cols-2">
                <TabsTrigger
                  value="liste"
                  className="gap-1.5 text-sm font-semibold"
                >
                  <ListIcon />
                  Liste
                </TabsTrigger>
                <TabsTrigger
                  value="kort"
                  className="gap-1.5 text-sm font-semibold"
                >
                  <MapIcon />
                  Kort
                </TabsTrigger>
              </TabsList>

              <div className="grid grid-cols-3 gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    aria-pressed={filter === f.id}
                    className={cn(
                      "flex h-11 flex-col items-center justify-center rounded-xl border text-xs leading-tight font-medium transition-colors",
                      filter === f.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/40 text-muted-foreground"
                    )}
                  >
                    <span>{f.label}</span>
                    <span className="opacity-70">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
            </div>
          </header>

          <TabsContent value="liste" asChild>
            <main className="mx-auto w-full max-w-lg space-y-2 px-3 py-3 pb-16 text-base">
              {shown.map(({ bar, visit, pending }) => (
                <BarCard
                  key={bar.id}
                  bar={bar}
                  visit={visit}
                  now={now}
                  pending={pending}
                  deleting={deletingBars.has(bar.id)}
                  onToggle={(next) => handleToggle(bar, next)}
                  onDelete={bar.custom ? () => handleDelete(bar) : undefined}
                />
              ))}

              {shown.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {emptyMessage(filter, query)}
                </p>
              )}

              <AddBarDialog now={now} onAdd={addBar} />
            </main>
          </TabsContent>

          <TabsContent
            value="kort"
            // flex-none, or the Tabs column layout would size this from flex-basis
            // and swallow the explicit height the map needs.
            className="flex-none overscroll-none"
            // Exactly the viewport below the header, so the page itself never scrolls.
            style={{ height: `calc(100dvh - ${headerHeight}px)` }}
          >
            {shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {emptyMessage(filter, query)}
              </p>
            ) : (
              <BarMap rows={shown} now={now} onToggle={handleToggle} />
            )}
          </TabsContent>
        </Tabs>
      ) : firstLoadFailed ? (
        <FirstLoadError
          message={error?.message ?? "Ingen kontakt til serveren."}
          onRetry={() => void refresh()}
        />
      ) : null}
    </>
  )
}

function emptyMessage(filter: Filter, query: string): string {
  if (query.trim()) return `Ingen barer matcher "${query.trim()}".`
  if (filter === "besoegt") return "I har ikke krydset nogen barer af endnu."
  if (filter === "mangler") return "Alle barer er besøgt. Godt gået! 🐔"
  return "Ingen barer endnu."
}

function Progress({ visited, total }: { visited: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((visited / total) * 100)
  const done = total > 0 && visited === total

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <p className="text-base font-semibold">
          {visited} af {total} barer besøgt
        </p>
        <p className="text-sm text-muted-foreground">{pct}%</p>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            done ? "bg-amber-400" : "bg-emerald-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {done && (
        <p className="text-sm font-medium text-amber-300">
          Alle barer besøgt — hjem med jer! 🐔🎉
        </p>
      )}
    </div>
  )
}
