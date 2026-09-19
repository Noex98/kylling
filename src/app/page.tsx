"use client"

import * as React from "react"
import { cn } from "cn"
import { toast } from "sonner"

import { AddBarDialog } from "@/components/add-bar-dialog"
import { BarCard } from "@/components/bar-card"
import { PlayerNameField, usePlayerName } from "@/components/player-name"
import { useGameState } from "@/components/use-game-state"
import { getOpenState, type OpenState } from "@/lib/hours"
import type { Bar, Visit } from "@/lib/types"

const FILTERS = [
  { id: "alle", label: "Alle" },
  { id: "aabne", label: "Åbne nu" },
  { id: "mangler", label: "Mangler" },
  { id: "besoegt", label: "Besøgt" },
] as const

type Filter = (typeof FILTERS)[number]["id"]

type Row = { bar: Bar; visit?: Visit; status: OpenState }

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

  const total = rows.length
  const visited = rows.filter((r) => r.visit).length
  const openNow = rows.filter((r) => r.status.isOpen).length
  const chickens = rows.filter((r) => r.visit?.chickenFound).length

  const counts: Record<Filter, number> = {
    alle: total,
    aabne: openNow,
    mangler: total - visited,
    besoegt: visited,
  }

  const shown = rows.filter((row) => {
    if (filter === "aabne") return row.status.isOpen
    if (filter === "mangler") return !row.visit
    if (filter === "besoegt") return Boolean(row.visit)
    return true
  })

  function handleToggle(bar: Bar, next: boolean) {
    void toggleVisit(bar.id, next, { by: name.trim() || undefined })
    if (next) toast.success(`${bar.name} krydset af 🐔`)
  }

  function handleChicken(bar: Bar, visit?: Visit) {
    const found = !visit?.chickenFound
    void toggleVisit(bar.id, true, {
      by: name.trim() || undefined,
      chickenFound: found,
    })
    if (found) toast.success(`🐔 Kylling fundet på ${bar.name}!`)
  }

  function handleDelete(bar: Bar) {
    if (!window.confirm(`Slet "${bar.name}"?`)) return
    void deleteBar(bar.id)
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto w-full max-w-lg space-y-3 px-3 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="font-heading text-xl font-bold tracking-tight">
              🐔 Kylling <span className="text-muted-foreground">Aarhus</span>
            </h1>
            {chickens > 0 && (
              <span className="text-sm text-amber-300">
                {chickens} {chickens === 1 ? "kylling" : "kyllinger"} fundet
              </span>
            )}
          </div>

          <Progress visited={visited} total={total} />

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

      <main className="mx-auto w-full max-w-lg space-y-2.5 px-3 py-3 pb-16">
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
                onChicken={() => handleChicken(bar, visit)}
                onDelete={bar.custom ? () => handleDelete(bar) : undefined}
              />
            ))}

            {shown.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {filter === "aabne"
                  ? "Ingen barer er åbne lige nu."
                  : filter === "besoegt"
                    ? "I har ikke krydset nogen barer af endnu."
                    : filter === "mangler"
                      ? "Alle barer er besøgt. Godt gået! 🐔"
                      : "Ingen barer endnu."}
              </p>
            )}

            <AddBarDialog now={now} onAdd={addBar} />
          </>
        )}
      </main>
    </div>
  )
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
