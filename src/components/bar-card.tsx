"use client"

import * as React from "react"
import { cn } from "cn"
import {
  AlarmClockIcon,
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
  type OpenState,
} from "@/lib/hours"
import { googleMapsDirectionsUrl, googleMapsUrl } from "@/lib/maps"
import type { Bar, Visit } from "@/lib/types"

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
  // Open: when it closes. Closed: when it opens again ("Åbner i morgen 20:00").
  // null only for a bar that never opens again — then the badge says it all.
  const hoursLine = status.isOpen
    ? formatOpeningLine(bar.hours, now)
    : formatNextOpening(bar.hours, now)

  return (
    <Card
      size="sm"
      className={cn(
        // 105 bars in one scroll: the card is sized to its content, not to a
        // comfortable-looking grid. Padding and gaps are as small as the
        // content tolerates — the tap targets inside are not.
        "gap-1.5 py-2.5 transition-opacity",
        visited && "bg-card/50 opacity-70"
      )}
    >
      <div className="flex items-start gap-2.5 px-(--card-spacing)">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2
            className={cn(
              "font-heading text-lg leading-tight font-semibold break-words",
              visited && "text-muted-foreground line-through"
            )}
          >
            {bar.name}
          </h2>

          {/* Address left, status right, one line. They only wrap apart when
              the address genuinely needs the width. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {/* The address is the tap target — it opens Google Maps in a new tab. */}
            <a
              href={googleMapsUrl(bar)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Åbn ${bar.name} i Google Maps`}
              className="-mx-1.5 flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:bg-muted/50"
            >
              <MapPinIcon className="size-4 shrink-0" />
              <span className="truncate underline decoration-dotted">
                {bar.address ?? "Vis på Google Maps"}
              </span>
            </a>

            {(hoursLine || !status.isOpen) && (
              <span className="flex shrink-0 items-center gap-2">
                <StatusBadge status={status} />
                {hoursLine && (
                  <span
                    className={cn(
                      "text-sm",
                      // Open is the norm tonight, so it stays quiet; a closed
                      // bar's next opening is the part worth reading.
                      status.isOpen
                        ? "text-muted-foreground"
                        : "font-medium text-foreground/90"
                    )}
                  >
                    {hoursLine}
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Notes run long and are colour, not navigation — two lines at most,
              and never louder than the name or the hours. */}
          {bar.note && (
            <p
              title={bar.note}
              className="line-clamp-2 text-xs leading-snug text-muted-foreground/80 italic"
            >
              {bar.note}
            </p>
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
            // Guarded rather than merely disabled: a second click that lands in
            // the same frame as the first would still reach this handler.
            onClick={() => {
              if (deleting) return
              onDelete()
            }}
          >
            {deleting ? <LoaderCircleIcon className="animate-spin" /> : <Trash2Icon />}
          </Button>
        )}
      </div>
    </Card>
  )
}

/**
 * Badges follow urgency, not state. Once the crawl is under way nearly every
 * bar is open, so "open" says nothing and gets no badge — only the bars about
 * to close (loud) and the ones already shut (quiet) are worth a glance.
 */
function StatusBadge({ status }: { status: OpenState }) {
  if (status.isClosingSoon && status.minutesUntilClosing !== null) {
    return (
      <Badge className="h-6 gap-1.5 border-amber-400/50 bg-amber-400/20 px-2.5 text-sm font-semibold text-amber-200">
        <AlarmClockIcon />
        Lukker {formatIn(status.minutesUntilClosing)}
      </Badge>
    )
  }
  if (!status.isOpen) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Lukket
      </Badge>
    )
  }
  return null
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
      // `disabled` is how this *looks* unavailable; the early return is what
      // makes a repeat tap actually do nothing. The hook refuses it a second
      // time against the mutation cache, so nothing is ever queued up.
      onClick={() => {
        if (pending) return
        onClick()
      }}
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
