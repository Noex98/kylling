"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { cn } from "cn"
import { ListIcon, MapIcon } from "lucide-react"
import { toast } from "sonner"

import { AddBarDialog } from "@/components/add-bar-dialog"
import { BarCard } from "@/components/bar-card"
import { barMatches, BarSearchField } from "@/components/bar-search"
import { PlayerNameField, usePlayerName } from "@/components/player-name"
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
  { id: "aabne", label: "Åbne nu" },
  { id: "mangler", label: "Mangler" },
  { id: "besoegt", label: "Besøgt" },
] as const

type Filter = (typeof FILTERS)[number]["id"]

type Row = { bar: Bar; visit?: Visit; status: OpenState }

type Tab = "liste" | "kort"

/**
 * The map has to fill exactly what is left below the sticky header — measure it
 * rather than guess, since the header grows with the search result line.
 */
function useHeaderHeight(): [React.RefObject<HTMLElement | null>, number] {
  const ref = React.useRef<HTMLElement | null>(null)
  const [height, setHeight] = React.useState(0)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setHeight(el.getBoundingClientRect().height)
    // Measuring the DOM is exactly what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, height]
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
  const { state, now, error, loading, toggleVisit, addBar, deleteBar } =
    useGameState()
  const [name, setName] = usePlayerName()
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
      }))
      .sort(compareRows)
  }, [state, now])

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
    aabne: searched.filter((r) => r.status.isOpen).length,
    mangler: searched.filter((r) => !r.visit).length,
    besoegt: searched.filter((r) => r.visit).length,
  }

  const shown = searched.filter((row) => {
    if (filter === "aabne") return row.status.isOpen
    if (filter === "mangler") return !row.visit
    if (filter === "besoegt") return Boolean(row.visit)
    return true
  })

  function handleToggle(bar: Bar, next: boolean) {
    void toggleVisit(bar.id, next, { by: name.trim() || undefined })
    if (next) toast.success(`${bar.name} krydset af 🐔`)
  }

  function handleDelete(bar: Bar) {
    if (!window.confirm(`Slet "${bar.name}"?`)) return
    void deleteBar(bar.id)
  }

  return (
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
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="font-heading text-xl font-bold tracking-tight">
              🐔 Kylling <span className="text-muted-foreground">Aarhus</span>
            </h1>
          </div>

          <Progress visited={visited} total={total} />

          <BarSearchField
            value={query}
            onChange={setQuery}
            resultCount={shown.length}
          />

          <TabsList className="grid h-11! w-full grid-cols-2">
            <TabsTrigger value="liste" className="gap-1.5 text-sm font-semibold">
              <ListIcon />
              Liste
            </TabsTrigger>
            <TabsTrigger value="kort" className="gap-1.5 text-sm font-semibold">
              <MapIcon />
              Kort
            </TabsTrigger>
          </TabsList>

          <div className="grid grid-cols-4 gap-1.5">
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
        <main className="mx-auto w-full max-w-lg space-y-2.5 px-3 py-3 pb-16 text-base">
          <PlayerNameField name={name} onNameChange={setName} />

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Ingen kontakt til serveren — prøver igen…
            </p>
          )}

          {loading || !now ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Henter barer… 🐔
            </p>
          ) : (
            <>
              {shown.map(({ bar, visit }) => (
                <BarCard
                  key={bar.id}
                  bar={bar}
                  visit={visit}
                  now={now}
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
            </>
          )}
        </main>
      </TabsContent>

      <TabsContent
        value="kort"
        className="overscroll-none"
        // Exactly the viewport below the header, so the page itself never scrolls.
        style={{ height: `calc(100dvh - ${headerHeight}px)` }}
      >
        {loading || !now ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Henter barer… 🐔
          </p>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {emptyMessage(filter, query)}
          </p>
        ) : (
          <BarMap rows={shown} now={now} onToggle={handleToggle} />
        )}
      </TabsContent>
    </Tabs>
  )
}

function emptyMessage(filter: Filter, query: string): string {
  if (query.trim()) return `Ingen barer matcher "${query.trim()}".`
  if (filter === "aabne") return "Ingen barer er åbne lige nu."
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
