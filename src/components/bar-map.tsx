"use client"

import * as React from "react"
import { divIcon, type DivIcon, type Map as LeafletMap } from "leaflet"
import {
  CheckIcon,
  CrosshairIcon,
  LoaderCircleIcon,
  LocateFixedIcon,
  MaximizeIcon,
  MinimizeIcon,
  NavigationIcon,
} from "lucide-react"
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
} from "react-leaflet"

import "leaflet/dist/leaflet.css"

import { Button } from "@/components/ui/button"
import {
  useGeolocation,
  type GeolocationTracker,
} from "@/components/use-geolocation"
import { coords } from "@/data/coords"
import { formatIn, formatOpeningLine, getOpenState } from "@/lib/hours"
import {
  AARHUS_CENTRE,
  formatMetres,
  googleMapsDirectionsUrl,
  googleMapsUrl,
} from "@/lib/maps"
import type { Bar, Visit } from "@/lib/types"
import type { Zone } from "@/lib/zone"

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
  /** The circle in force, or null while no zone has been announced. */
  zone: Zone | null
  onToggle: (bar: Bar, visited: boolean) => void
}

/** The colour of the closed-off area. Not a warning — a dead zone. */
const ZONE_EDGE = "#f59e0b"

/**
 * The zone drawn the way Fortnite draws it: the *outside* is what gets painted,
 * so the ring reads as the edge of the playable world rather than as a circle
 * someone drew on a map.
 *
 * A Leaflet polygon renders its second ring as a hole, so one shape covering
 * everything minus the circle does the whole job. The ring is approximated with
 * enough points that it stays smooth at full zoom; the equirectangular metres
 * -> degrees conversion is plenty at 1.6 km and 56°N, where the error is
 * centimetres.
 */
const ZONE_RING_POINTS = 128

/** A box big enough to cover the map at any zoom, without touching the poles. */
const WORLD_RING: [number, number][] = [
  [-85, -180],
  [-85, 180],
  [85, 180],
  [85, -180],
]

function ringAround(zone: Zone): [number, number][] {
  const metresPerDegreeLat = 111_320
  const metresPerDegreeLng =
    metresPerDegreeLat * Math.cos((zone.centre.lat * Math.PI) / 180)
  const dLat = zone.radius / metresPerDegreeLat
  const dLng = zone.radius / metresPerDegreeLng

  return Array.from({ length: ZONE_RING_POINTS }, (_, i) => {
    const angle = (i / ZONE_RING_POINTS) * 2 * Math.PI
    return [
      zone.centre.lat + dLat * Math.sin(angle),
      zone.centre.lng + dLng * Math.cos(angle),
    ] as [number, number]
  })
}

function ZoneOverlay({ zone }: { zone: Zone }) {
  const ring = React.useMemo(() => ringAround(zone), [zone])

  return (
    <>
      {/* Everything outside the circle, dimmed. `interactive={false}` matters:
          this shape covers the whole map, and a tap on it must still reach the
          marker underneath. */}
      <Polygon
        positions={[WORLD_RING, ring]}
        interactive={false}
        pathOptions={{
          stroke: false,
          fillColor: "#000000",
          fillOpacity: 0.55,
          className: "kylling-zone-outside",
        }}
      />
      {/* The edge itself, drawn separately so it keeps a crisp line over the
          dimmed side and the lit one. */}
      <Circle
        center={[zone.centre.lat, zone.centre.lng]}
        radius={zone.radius}
        interactive={false}
        pathOptions={{
          color: ZONE_EDGE,
          weight: 2,
          opacity: 0.85,
          fill: false,
          className: "kylling-zone-edge",
        }}
      />
    </>
  )
}

/** Zoomed so Aarhus C's bar streets fill a phone screen. */
const DEFAULT_ZOOM = 15

type MarkerKind = "closingSoon" | "open" | "visited" | "closed"

const MARKER_STYLE: Record<
  MarkerKind,
  { color: string; ring: string; glyph: string; size: number; label: string }
> = {
  /**
   * The one that has to catch the eye: once the evening is under way nearly
   * everything is open, so "open" says nothing and "about to close" says
   * everything. Amber against the inverted-grey tiles, biggest of the four,
   * and the only pin with a "!" — so it still reads on a dim phone screen and
   * without relying on colour alone.
   */
  closingSoon: {
    color: "#f59e0b",
    ring: "rgba(255,255,255,0.95)",
    glyph: "!",
    size: 34,
    label: "Lukker snart",
  },
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

const LEGEND: MarkerKind[] = ["closingSoon", "open", "visited", "closed"]

/**
 * Leaflet's bundled marker images break under bundlers, and the four bar
 * colours are the whole point here — so every marker is a `divIcon` we draw
 * ourselves. Cached: the poll re-renders this component every five seconds.
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

/**
 * Precedence, strongest first: a bar you have already ticked off is done, so it
 * never shouts "lukker snart" at you; among the ones still missing, closing
 * soon beats plain open.
 */
function kindOf(row: BarMapRow, now: Date): MarkerKind {
  const state = getOpenState(row.bar.hours, now)
  if (!state.isOpen) return "closed"
  if (row.visit) return "visited"
  return state.isClosingSoon ? "closingSoon" : "open"
}

/**
 * The player is not a fifth bar, so it is not a fifth pin: a filled dot with
 * a halo, the convention every map app uses. Purple keeps it clear of the
 * green/amber/blue/grey the bars already own.
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
.kylling-map .leaflet-popup-content-wrapper { border-radius: 12px; padding: 0; }
/* A popup covers the very thing you are looking at, so it gets no more room
   than it needs: no min-width of our own, and Leaflet's 1.08em bump undone so
   the type sizes below are the sizes you actually get. */
.kylling-map .leaflet-popup-content {
  margin: 0; width: auto !important; min-width: 0;
  font-size: inherit; line-height: 1.3;
}
/* Leaflet ships "margin: 1.3em 0" on every <p> inside a popup at (0,1,1),
   which outranks Tailwind's preflight reset — about 20px of dead space above
   the name and below the hours line, for nothing. Kill it here and let flex
   "gap" own the spacing: gap is a different property, so no utility class
   downstream has to win a specificity fight against this rule. */
.kylling-map .leaflet-popup-content p { margin: 0; }
.kylling-map .leaflet-popup-content a { color: inherit; }
/* Trimmed visually, but the 34px hit area stays — it is still a tap target. */
.kylling-map .leaflet-popup-close-button {
  width: 34px; height: 34px; padding: 4px 4px 0 0;
  font-size: 20px; color: var(--muted-foreground);
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
/* Fullscreen: keep Leaflet's own controls clear of the notch and the rounded
   corners. Only the top/side insets — the legend footer owns the bottom one. */
.kylling-fullscreen .leaflet-top { padding-top: env(safe-area-inset-top, 0px); }
.kylling-fullscreen .leaflet-left { padding-left: env(safe-area-inset-left, 0px); }
.kylling-fullscreen .leaflet-right { padding-right: env(safe-area-inset-right, 0px); }
/* Only reached where the Fullscreen API actually works; it paints white. */
.kylling-map:fullscreen { background: var(--background); }
`

export function BarMap({ rows, now, zone, onToggle }: BarMapProps) {
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

  /**
   * Fullscreen is a CSS overlay, not the Fullscreen API. `requestFullscreen`
   * on an arbitrary element does nothing at all on iOS Safari — it is simply
   * not there — and tonight the whole group is on phones. The overlay is what
   * does the work; the native call further down is a bonus on Android/desktop.
   */
  const [fullscreen, setFullscreen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  /** Did we push the back-button entry? Only then may we pop it. */
  const pushedHistory = React.useRef(false)

  const exitFullscreen = React.useCallback((popHistory = true) => {
    setFullscreen(false)
    if (
      typeof document !== "undefined" &&
      document.fullscreenElement &&
      typeof document.exitFullscreen === "function"
    ) {
      document.exitFullscreen().catch(() => {})
    }
    if (popHistory && pushedHistory.current) {
      pushedHistory.current = false
      try {
        window.history.back()
      } catch {
        // A blocked history is not a reason to stay stuck in fullscreen.
      }
    }
  }, [])

  const enterFullscreen = React.useCallback(() => {
    setFullscreen(true)
    // One history entry, so Android's back gesture leaves the map instead of
    // leaving the game. Same URL, so nothing navigates.
    try {
      window.history.pushState({ kyllingFullscreen: true }, "")
      pushedHistory.current = true
    } catch {
      pushedHistory.current = false
    }
    const el = rootRef.current
    if (el && typeof el.requestFullscreen === "function") {
      el.requestFullscreen().catch(() => {})
    }
  }, [])

  const toggleFullscreen = React.useCallback(() => {
    if (fullscreen) exitFullscreen()
    else enterFullscreen()
  }, [fullscreen, exitFullscreen, enterFullscreen])

  /**
   * Leaflet caches the container size and paints grey where it thinks there is
   * nothing. Entering and leaving the overlay changes that size, so tell it —
   * after the browser has laid the new box out, not before.
   */
  React.useEffect(() => {
    if (!map) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => map.invalidateSize())
    })
    // Belt and braces for mobile Safari, which resizes its chrome afterwards.
    const settle = window.setTimeout(() => map.invalidateSize(), 300)
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
      window.clearTimeout(settle)
    }
  }, [map, fullscreen])

  // Rotation and the parent's height measurement move the box too.
  React.useEffect(() => {
    if (!map) return
    const onResize = () => map.invalidateSize()
    window.addEventListener("resize", onResize)
    window.addEventListener("orientationchange", onResize)
    const el = rootRef.current
    const observer =
      el && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(onResize)
        : null
    if (el && observer) observer.observe(el)
    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("orientationchange", onResize)
      observer?.disconnect()
    }
  }, [map])

  // Escape leaves fullscreen — but an open popup gets the first press. Capture
  // phase, so we see the key before Leaflet closes the popup itself.
  React.useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (rootRef.current?.querySelector(".leaflet-popup")) {
        map?.closePopup()
        return
      }
      exitFullscreen()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [fullscreen, map, exitFullscreen])

  // The back press already consumed the history entry, so do not pop it again.
  React.useEffect(() => {
    if (!fullscreen) return
    const onPopState = () => {
      pushedHistory.current = false
      exitFullscreen(false)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [fullscreen, exitFullscreen])

  // Where native fullscreen did engage, the browser's own exit (desktop Esc,
  // the Android shade) must take the overlay with it.
  React.useEffect(() => {
    if (!fullscreen) return
    const onChange = () => {
      if (!document.fullscreenElement) exitFullscreen()
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [fullscreen, exitFullscreen])

  // Nothing behind the overlay should scroll or rubber-band under it.
  React.useEffect(() => {
    if (!fullscreen) return
    const { body } = document
    const overflow = body.style.overflow
    const overscroll = body.style.overscrollBehavior
    body.style.overflow = "hidden"
    body.style.overscrollBehavior = "none"
    return () => {
      body.style.overflow = overflow
      body.style.overscrollBehavior = overscroll
    }
  }, [fullscreen])

  return (
    <div
      ref={rootRef}
      // 100dvh, never 100vh: on mobile Safari and Chrome 100vh is taller than
      // what you can see, and the legend would sit under the browser chrome.
      className={
        fullscreen
          ? "kylling-map kylling-fullscreen fixed inset-0 z-50 flex h-dvh w-full flex-col overscroll-none bg-background"
          : "kylling-map flex h-full w-full flex-col"
      }
    >
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

          {zone && <ZoneOverlay zone={zone} />}

          {placed.map(({ row, lat, lng }) => {
            const kind = kindOf(row, now)
            return (
              <Marker
                key={row.bar.id}
                position={[lat, lng]}
                icon={iconFor(kind)}
                // Aarhus C stacks bars on top of each other; the ones about to
                // close must not end up buried under a neighbour. Still well
                // under the player dot, which owns 1000.
                zIndexOffset={kind === "closingSoon" ? 500 : 0}
                title={row.bar.name}
              >
                <Popup>
                  <BarPopup row={row} now={now} onToggle={onToggle} />
                </Popup>
              </Marker>
            )
          })}

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

        <PlayerControls
          geo={geo}
          onRecentre={centreOnPlayer}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>

      <div
        className="shrink-0 space-y-1.5 border-t bg-background px-3 py-2"
        // Fullscreen puts this strip on the very edge of the screen, so it has
        // to clear the home indicator and the landscape corners itself.
        style={
          fullscreen
            ? {
                paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))",
                paddingLeft: "calc(0.75rem + env(safe-area-inset-left, 0px))",
                paddingRight:
                  "calc(0.75rem + env(safe-area-inset-right, 0px))",
              }
            : undefined
        }
      >
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
          {/* Fullscreen hides the header, so this is the only place the zone is
              named while the map is filling the screen. */}
          {zone && (
            <li className="flex items-center gap-1.5 text-xs font-medium text-amber-200/90">
              <span
                aria-hidden
                className="inline-block size-3 shrink-0 rounded-full border-2"
                style={{ borderColor: ZONE_EDGE }}
              />
              Zone {zone.number} — {formatMetres(zone.radius)}
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
  fullscreen,
  onToggleFullscreen,
}: {
  geo: GeolocationTracker
  onRecentre: () => void
  fullscreen: boolean
  onToggleFullscreen: () => void
}) {
  const locating = geo.status === "locating"
  // "blocked" means there is nothing to retry — no API, or an insecure page.
  // The footer explains it in Danish; a dead button would only tease.
  const canAsk = geo.status !== "blocked"

  return (
    <div
      className="pointer-events-none absolute right-3 bottom-8 z-[1000] flex flex-col items-end gap-2"
      style={
        fullscreen
          ? { paddingRight: "env(safe-area-inset-right, 0px)" }
          : undefined
      }
    >
      <Button
        type="button"
        variant="secondary"
        size="icon-lg"
        onClick={onToggleFullscreen}
        aria-pressed={fullscreen}
        aria-label={fullscreen ? "Luk fuldskærm" : "Vis kort i fuldskærm"}
        title={fullscreen ? "Luk fuldskærm" : "Fuldskærm"}
        className="pointer-events-auto size-11 rounded-full border border-border/70 shadow-lg"
      >
        {fullscreen ? (
          <MinimizeIcon className="size-5" />
        ) : (
          <MaximizeIcon className="size-5" />
        )}
      </Button>

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
  // The actionable half of "lukker snart": the clock time alone makes you do
  // the arithmetic, so spell out how long you have left. "Lukker 02:00 · om 25 min".
  const closingIn =
    status.isClosingSoon && status.minutesUntilClosing !== null
      ? formatIn(status.minutesUntilClosing)
      : null

  return (
    <div className="flex w-[200px] flex-col gap-2 p-2.5 font-sans">
      <div className="flex flex-col gap-0.5">
        {/* pr-6 keeps the first line clear of Leaflet's close button, and two
            lines is the ceiling — a long name must not push the tick control
            down the screen. */}
        <p className="font-heading line-clamp-2 pr-6 text-[15px] leading-tight font-semibold text-foreground">
          {bar.name}
        </p>
        <p
          className={`text-[13px] leading-tight ${
            closingIn
              ? "font-semibold text-amber-400"
              : status.isOpen
                ? "font-medium text-emerald-400"
                : "text-muted-foreground"
          }`}
        >
          {formatOpeningLine(bar.hours, now)}
          {closingIn ? ` · ${closingIn}` : ""}
        </p>
      </div>

      {/* h-11 is load-bearing: one-handed, in the dark, after a few drinks.
          Nothing below is allowed to shrink it. */}
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
