"use client"

import * as React from "react"
import { divIcon, type DivIcon, type Map as LeafletMap } from "leaflet"
import {
  CheckIcon,
  CrosshairIcon,
  LoaderCircleIcon,
  LocateFixedIcon,
  NavigationIcon,
} from "lucide-react"
import { Circle, MapContainer, Marker, Popup, TileLayer } from "react-leaflet"

import "leaflet/dist/leaflet.css"

import { Button } from "@/components/ui/button"
import {
  useGeolocation,
  type GeolocationTracker,
} from "@/components/use-geolocation"
import { coords } from "@/data/coords"
import { formatOpeningLine, getOpenState } from "@/lib/hours"
import {
  AARHUS_CENTRE,
  googleMapsDirectionsUrl,
  googleMapsUrl,
} from "@/lib/maps"
import type { Bar, Visit } from "@/lib/types"

/**
 * Leaflet touches `window`, so this module must only ever be loaded through
 * `next/dynamic` with `{ ssr: false }` — see src/app/page.tsx.
 */

export type BarMapRow = {
  bar: Bar
  visit?: Visit
  /** This bar's tick is waiting on the server. */
  pending?: boolean
}

type BarMapProps = {
  /** Already filtered by the chips in the header. */
  rows: BarMapRow[]
  /** Server-aligned "now", so open/closed matches the list. */
  now: Date
  onToggle: (bar: Bar, visited: boolean) => void
}

/** Zoomed so Aarhus C's bar streets fill a phone screen. */
const DEFAULT_ZOOM = 15

type MarkerKind = "open" | "visited" | "closed"

const MARKER_STYLE: Record<
  MarkerKind,
  { color: string; ring: string; glyph: string; size: number; label: string }
> = {
  open: {
    color: "#10b981",
    ring: "rgba(255,255,255,0.95)",
    glyph: "",
    size: 30,
    label: "Åben — mangler",
  },
  visited: {
    color: "#0ea5e9",
    ring: "rgba(255,255,255,0.8)",
    glyph: "✓",
    size: 26,
    label: "Åben — besøgt",
  },
  closed: {
    color: "#52525b",
    ring: "rgba(255,255,255,0.45)",
    glyph: "",
    size: 22,
    label: "Lukket",
  },
}

const LEGEND: MarkerKind[] = ["open", "visited", "closed"]

/**
 * Leaflet's bundled marker images break under bundlers, and four colours are
 * the whole point here — so every marker is a `divIcon` we draw ourselves.
 * Cached: the poll re-renders this component every five seconds.
 */
const iconCache = new Map<MarkerKind, DivIcon>()

function iconFor(kind: MarkerKind): DivIcon {
  const cached = iconCache.get(kind)
  if (cached) return cached

  const s = MARKER_STYLE[kind]
  const icon = divIcon({
    className: "kylling-marker",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${s.size}px;height:${s.size}px;border-radius:9999px;background:${s.color};border:2px solid ${s.ring};box-shadow:0 2px 8px rgba(0,0,0,0.65);font-size:${Math.round(s.size * 0.52)}px;line-height:1;font-weight:700;color:#0a0a0a">${s.glyph}</span>`,
    iconSize: [s.size, s.size],
    iconAnchor: [s.size / 2, s.size / 2],
    popupAnchor: [0, -(s.size / 2 + 2)],
  })
  iconCache.set(kind, icon)
  return icon
}

function kindOf(row: BarMapRow, now: Date): MarkerKind {
  const open = getOpenState(row.bar.hours, now).isOpen
  if (!open) return "closed"
  return row.visit ? "visited" : "open"
}

/**
 * The player is not a fourth bar, so it is not a fourth pin: a filled dot with
 * a halo, the convention every map app uses. Purple keeps it clear of the
 * green/blue/grey the bars already own.
 */
const PLAYER_COLOR = "#a855f7"
const PLAYER_SIZE = 30

/**
 * Past a few hundred metres the accuracy circle stops being information and
 * starts being a purple blanket over Aarhus — a laptop on wifi reports
 * kilometres. Beyond this we keep the dot and drop the circle.
 */
const MAX_ACCURACY_CIRCLE_M = 3000

/** Recentring below this zoom would leave the dot in a sea of nothing. */
const PLAYER_ZOOM = 16

let playerIconCache: DivIcon | null = null

function playerIcon(): DivIcon {
  if (playerIconCache) return playerIconCache
  const dot = 14
  playerIconCache = divIcon({
    className: "kylling-marker",
    html: `<span style="position:relative;display:block;width:${PLAYER_SIZE}px;height:${PLAYER_SIZE}px">
      <span class="kylling-me-halo" style="position:absolute;inset:0;border-radius:9999px;background:${PLAYER_COLOR}"></span>
      <span style="position:absolute;top:50%;left:50%;width:${dot}px;height:${dot}px;margin:-${dot / 2}px 0 0 -${dot / 2}px;border-radius:9999px;background:${PLAYER_COLOR};border:3px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.45),0 2px 10px rgba(0,0,0,0.7)"></span>
    </span>`,
    iconSize: [PLAYER_SIZE, PLAYER_SIZE],
    iconAnchor: [PLAYER_SIZE / 2, PLAYER_SIZE / 2],
  })
  return playerIconCache
}

/** Dark tiles without a second tile provider: invert the OSM raster. */
const MAP_CSS = `
.kylling-map .leaflet-container {
  background: #0d0d0f;
  font: inherit;
  outline: none;
}
.kylling-map .leaflet-tile-pane {
  filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9) saturate(0.55);
}
.kylling-map .leaflet-popup-content-wrapper,
.kylling-map .leaflet-popup-tip {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
}
.kylling-map .leaflet-popup-content-wrapper { border-radius: 14px; padding: 0; }
.kylling-map .leaflet-popup-content { margin: 0; width: auto !important; min-width: 210px; }
.kylling-map .leaflet-popup-content a { color: inherit; }
.kylling-map .leaflet-popup-close-button {
  width: 34px; height: 34px; padding: 6px 6px 0 0;
  font-size: 22px; color: var(--muted-foreground);
}
.kylling-map .leaflet-control-zoom a {
  width: 38px; height: 38px; line-height: 38px; font-size: 20px;
  background: var(--card); color: var(--card-foreground);
  border-color: var(--border);
}
.kylling-map .leaflet-control-zoom a:hover { background: var(--muted); }
.kylling-map .leaflet-control-attribution {
  background: rgba(0, 0, 0, 0.55);
  color: #a1a1aa;
  font-size: 10px;
}
.kylling-map .leaflet-control-attribution a { color: #d4d4d8; }
.kylling-map .kylling-marker { background: none; border: none; }
.kylling-map .kylling-me-halo {
  opacity: 0.35;
  animation: kylling-me-pulse 2.4s ease-out infinite;
}
@keyframes kylling-me-pulse {
  0% { transform: scale(0.55); opacity: 0.45; }
  70%, 100% { transform: scale(1.4); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .kylling-map .kylling-me-halo { animation: none; opacity: 0.3; }
}
`

export function BarMap({ rows, now, onToggle }: BarMapProps) {
  // Not every bar has coordinates — those must not vanish silently.
  const { placed, missing } = React.useMemo(() => {
    const placed: { row: BarMapRow; lat: number; lng: number }[] = []
    const missing: Bar[] = []
    for (const row of rows) {
      const point = coords[row.bar.id]
      if (point) placed.push({ row, lat: point.lat, lng: point.lng })
      else missing.push(row.bar)
    }
    return { placed, missing }
  }, [rows])

  // Nothing here runs until the player taps "Find mig" — see use-geolocation.
  const geo = useGeolocation()
  const [map, setMap] = React.useState<LeafletMap | null>(null)
  const centredOnce = React.useRef(false)

  const centreOnPlayer = React.useCallback(() => {
    if (!map || !geo.position) return
    map.flyTo([geo.position.lat, geo.position.lng], PLAYER_ZOOM, {
      duration: 0.6,
    })
  }, [map, geo.position])

  // The first fix jumps to the player once; after that the map is theirs to
  // pan, and only the "Centrér" button moves it again.
  React.useEffect(() => {
    if (!map || !geo.position || centredOnce.current) return
    centredOnce.current = true
    map.flyTo([geo.position.lat, geo.position.lng], PLAYER_ZOOM, {
      duration: 0.6,
    })
  }, [map, geo.position])

  return (
    <div className="kylling-map flex h-full w-full flex-col">
      <style>{MAP_CSS}</style>

      <div className="relative min-h-0 flex-1">
        <MapContainer
          ref={setMap}
          center={[AARHUS_CENTRE.lat, AARHUS_CENTRE.lng]}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={19}
          />

          {placed.map(({ row, lat, lng }) => (
            <Marker
              key={row.bar.id}
              position={[lat, lng]}
              icon={iconFor(kindOf(row, now))}
              title={row.bar.name}
            >
              <Popup>
                <BarPopup row={row} now={now} onToggle={onToggle} />
              </Popup>
            </Marker>
          ))}

          {geo.position && (
            <>
              {geo.position.accuracy > 0 &&
                geo.position.accuracy <= MAX_ACCURACY_CIRCLE_M && (
                  <Circle
                    center={[geo.position.lat, geo.position.lng]}
                    radius={geo.position.accuracy}
                    interactive={false}
                    pathOptions={{
                      color: PLAYER_COLOR,
                      weight: 1,
                      opacity: 0.5,
                      fillColor: PLAYER_COLOR,
                      fillOpacity: 0.12,
                    }}
                  />
                )}
              {/* Non-interactive, so it can never swallow a tap meant for the
                  bar pin underneath it. */}
              <Marker
                position={[geo.position.lat, geo.position.lng]}
                icon={playerIcon()}
                interactive={false}
                keyboard={false}
                zIndexOffset={1000}
                title="Dig"
              />
            </>
          )}
        </MapContainer>

        <PlayerControls geo={geo} onRecentre={centreOnPlayer} />
      </div>

      <div className="shrink-0 space-y-1.5 border-t bg-background px-3 py-2">
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {LEGEND.map((kind) => (
            <li
              key={kind}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                aria-hidden
                className="inline-block size-3 shrink-0 rounded-full border border-white/50"
                style={{ background: MARKER_STYLE[kind].color }}
              />
              {MARKER_STYLE[kind].label}
            </li>
          ))}
          {geo.position && (
            <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="inline-block size-3 shrink-0 rounded-full border border-white/50"
                style={{ background: PLAYER_COLOR }}
              />
              Dig — ca. ±{Math.round(geo.position.accuracy)} m
            </li>
          )}
        </ul>

        {/* Calm and inline: geolocation errors repeat, and a toast per repeat
            would bury the game. */}
        {geo.message && (
          <p role="status" className="text-xs break-words text-muted-foreground">
            {geo.message}
          </p>
        )}

        {missing.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer py-1 marker:text-muted-foreground">
              {missing.length}{" "}
              {missing.length === 1 ? "bar mangler" : "barer mangler"} placering
            </summary>
            <p className="max-h-20 overflow-y-auto pt-1 pb-1 break-words">
              {missing.map((bar) => bar.name).join(" · ")}
            </p>
          </details>
        )}
      </div>
    </div>
  )
}

/**
 * Floats over the map, outside the Leaflet container, so Leaflet's own drag and
 * double-tap-zoom handlers never see these taps.
 */
function PlayerControls({
  geo,
  onRecentre,
}: {
  geo: GeolocationTracker
  onRecentre: () => void
}) {
  const locating = geo.status === "locating"
  // "blocked" means there is nothing to retry — no API, or an insecure page.
  // The footer explains it in Danish; a dead button would only tease.
  const canAsk = geo.status !== "blocked"

  return (
    <div className="pointer-events-none absolute right-3 bottom-8 z-[1000] flex flex-col items-end gap-2">
      {geo.position && (
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={onRecentre}
          className="pointer-events-auto h-11 rounded-full border border-border/70 px-4 text-sm font-semibold shadow-lg"
        >
          <CrosshairIcon />
          Centrér
        </Button>
      )}

      {/* No position yet? Then the only way the prompt ever appears is here,
          on a deliberate tap. Never on mount. */}
      {!geo.position && canAsk && (
        <Button
          type="button"
          size="lg"
          onClick={geo.start}
          disabled={locating}
          aria-busy={locating}
          className="pointer-events-auto h-11 rounded-full px-4 text-sm font-semibold shadow-lg"
        >
          {locating ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <LocateFixedIcon />
          )}
          {locating
            ? "Finder dig…"
            : geo.status === "failed"
              ? "Prøv igen"
              : "Find mig"}
        </Button>
      )}
    </div>
  )
}

function BarPopup({
  row,
  now,
  onToggle,
}: {
  row: BarMapRow
  now: Date
  onToggle: (bar: Bar, visited: boolean) => void
}) {
  const { bar, visit, pending } = row
  const visited = Boolean(visit)
  const status = getOpenState(bar.hours, now)

  return (
    <div className="w-[220px] space-y-2 p-3 font-sans">
      <div className="space-y-0.5">
        <p className="font-heading text-base leading-tight font-semibold text-foreground">
          {bar.name}
        </p>
        <p
          className={
            status.isOpen
              ? "text-sm font-medium text-emerald-400"
              : "text-sm text-muted-foreground"
          }
        >
          {formatOpeningLine(bar.hours, now)}
        </p>
      </div>

      <Button
        variant={visited ? "secondary" : "default"}
        size="lg"
        className="h-11 w-full text-sm"
        aria-pressed={visited}
        aria-busy={pending}
        disabled={pending}
        onClick={() => onToggle(bar, !visited)}
      >
        {pending ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}
        {pending ? "Gemmer…" : visited ? "Fortryd" : "Kryds af"}
      </Button>

      <div className="flex items-center gap-2">
        <a
          href={googleMapsUrl(bar)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 flex-1 items-center justify-center rounded-lg border border-border text-xs font-medium text-foreground no-underline"
        >
          Google Maps
        </a>
        <a
          href={googleMapsDirectionsUrl(bar)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-border text-xs font-medium text-foreground no-underline"
        >
          <NavigationIcon className="size-3.5" />
          Vis rute
        </a>
      </div>
    </div>
  )
}
