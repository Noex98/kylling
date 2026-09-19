"use client"

import * as React from "react"
import { cn } from "cn"
import {
  CheckIcon,
  LoaderCircleIcon,
  MapPinIcon,
  NavigationIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  formatIn,
  formatNextOpening,
  formatOpeningLine,
  formatTime,
  getOpenState,
} from "@/lib/hours"
import { googleMapsDirectionsUrl, googleMapsUrl } from "@/lib/maps"
import type { Bar, Visit } from "@/lib/types"

/** Bars opening within this many minutes get the "åbner snart" treatment. */
export const SOON_MINUTES = 120

type BarCardProps = {
  bar: Bar
  visit?: Visit
  now: Date
  /** This bar's tick is waiting on the server. */
  pending?: boolean
  /** This bar is being deleted. */
  deleting?: boolean
  onToggle: (visited: boolean) => void
  onDelete?: () => void
}

export function BarCard({
  bar,
  visit,
  now,
  pending = false,
  deleting = false,
  onToggle,
  onDelete,
}: BarCardProps) {
  const status = getOpenState(bar.hours, now)
  const visited = Boolean(visit)
  const soon =
    !status.isOpen &&
    status.minutesUntilOpen !== null &&
    status.minutesUntilOpen <= SOON_MINUTES
  const nextOpening = status.opensToday ? null : formatNextOpening(bar.hours, now)

  return (
    <Card
      size="sm"
      className={cn(
        "gap-2 transition-opacity",
        visited && "bg-card/50 opacity-70"
      )}
    >
      <div className="flex items-start gap-3 px-(--card-spacing)">
        <div className="min-w-0 flex-1 space-y-1">
          <h2
            className={cn(
              "font-heading text-lg leading-tight font-semibold break-words",
              visited && "text-muted-foreground line-through"
            )}
          >
            {bar.name}
          </h2>

          {/* The address is the tap target — it opens Google Maps in a new tab. */}
          <a
            href={googleMapsUrl(bar)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Åbn ${bar.name} i Google Maps`}
            className="-mx-1.5 flex min-h-9 items-start gap-1.5 rounded-lg px-1.5 py-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:bg-muted/50"
          >
            <MapPinIcon className="mt-0.5 size-4 shrink-0" />
            <span className="break-words underline decoration-dotted">
              {bar.address ?? "Vis på Google Maps"}
            </span>
          </a>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
            <StatusBadge open={status.isOpen} soon={soon} />
            <span
              className={cn(
                "text-sm font-medium",
                status.isOpen ? "text-emerald-400" : "text-muted-foreground"
              )}
            >
              {formatOpeningLine(bar.hours, now)}
            </span>
            {soon && status.minutesUntilOpen !== null && (
              <span className="text-sm text-amber-400">
                {formatIn(status.minutesUntilOpen)}
              </span>
            )}
          </div>

          {nextOpening && (
            <p className="text-sm text-muted-foreground">{nextOpening}</p>
          )}

          {bar.note && (
            <p className="text-sm text-muted-foreground italic">{bar.note}</p>
          )}
        </div>

        <TickButton
          visited={visited}
          pending={pending}
          label={bar.name}
          onClick={() => onToggle(!visited)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 px-(--card-spacing)">
        {/* Everyone is walking, so gå-ruten er det nyttige link. */}
        <Button variant="outline" size="lg" className="h-10 text-sm" asChild>
          <a
            href={googleMapsDirectionsUrl(bar)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Vis gåruten til ${bar.name}`}
          >
            <NavigationIcon />
            Vis rute
          </a>
        </Button>

        {visit && (
          <span className="text-xs text-muted-foreground">
            Krydset kl. {formatTime(new Date(visit.at))}
          </span>
        )}

        {bar.custom && onDelete && (
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Slet ${bar.name}`}
            aria-busy={deleting}
            disabled={deleting}
            className="ml-auto text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            {deleting ? <LoaderCircleIcon className="animate-spin" /> : <Trash2Icon />}
          </Button>
        )}
      </div>
    </Card>
  )
}

function StatusBadge({ open, soon }: { open: boolean; soon: boolean }) {
  if (open) {
    return (
      <Badge className="border-emerald-400/40 bg-emerald-400/15 text-emerald-300">
        Åben nu
      </Badge>
    )
  }
  if (soon) {
    return (
      <Badge className="border-amber-400/40 bg-amber-400/15 text-amber-300">
        Åbner snart
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Lukket
    </Badge>
  )
}

/** Deliberately huge — this gets tapped one-handed, in the dark, after a beer. */
function TickButton({
  visited,
  pending,
  label,
  onClick,
}: {
  visited: boolean
  pending: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={visited}
      aria-busy={pending}
      aria-label={
        pending
          ? `Gemmer ${label}…`
          : visited
            ? `Fortryd besøg på ${label}`
            : `Kryds ${label} af`
      }
      className={cn(
        "flex size-16 shrink-0 items-center justify-center rounded-2xl border-2 transition-colors outline-none select-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50 not-disabled:active:translate-y-px",
        visited
          ? "border-emerald-400 bg-emerald-500 text-white"
          : "border-border bg-muted/40 text-muted-foreground not-disabled:hover:bg-muted",
        // Waiting on the server, so it must neither look nor be tappable.
        pending && "cursor-progress border-dashed opacity-60"
      )}
    >
      {pending ? (
        <LoaderCircleIcon className="size-8 animate-spin" strokeWidth={3} />
      ) : (
        <CheckIcon className="size-8" strokeWidth={3} />
      )}
    </button>
  )
}
