"use client"

import * as React from "react"

/**
 * Follows the player with `navigator.geolocation.watchPosition`.
 *
 * Deliberately inert until `start()` is called: a permission prompt that fires
 * the moment the tab opens gets dismissed by reflex — and on iOS Safari you
 * only ever get asked once. So the prompt has to come from a real tap.
 */

/** The player's last known spot, exactly as the browser reported it. */
export type PlayerPosition = {
  lat: number
  lng: number
  /** Radius in metres the browser claims the fix is good to. */
  accuracy: number
  /** Epoch ms of the fix. */
  at: number
}

export type GeoStatus =
  /** Never asked — waiting for the tap. */
  | "idle"
  /** Watching, no fix yet. */
  | "locating"
  /** We have a fix and are following it. */
  | "tracking"
  /** Asked, and it did not work out. Retryable. */
  | "failed"
  /** Cannot even ask: no API, or the page is not a secure context. */
  | "blocked"

export type GeolocationTracker = {
  status: GeoStatus
  position: PlayerPosition | null
  /** Danish, already phrased for the player. `null` when nothing is wrong. */
  message: string | null
  /** Begins watching. Call this from a user gesture, never on mount. */
  start: () => void
  /** Stops watching. Called for you on unmount. */
  stop: () => void
}

/** Every message the player can ever see from this hook. Calm, no blame. */
const MESSAGES = {
  denied:
    "Du har sagt nej til din placering. Slå den til for siden i browserens indstillinger, hvis du vil se dig selv på kortet.",
  unavailable:
    "Din placering kan ikke findes lige nu — det sker tit indendørs. Kortet virker som altid.",
  timeout:
    "Det tog for lang tid at finde din placering. Prøv igen om et øjeblik.",
  unsupported:
    "Din browser kan ikke finde din placering. Kortet virker som altid.",
  insecure:
    "Din placering kræver en sikker forbindelse. Åbn siden med https, så kan du se dig selv på kortet.",
} as const

const WATCH_OPTIONS: PositionOptions = {
  // Walking between bars: GPS, not the coarse wifi guess.
  enableHighAccuracy: true,
  // A fix from a few seconds ago is still "here" at walking pace.
  maximumAge: 5_000,
  // Long enough for a cold fix between tall buildings.
  timeout: 20_000,
}

/**
 * Remembers, for this tab only, that the player already tapped "Find mig", so
 * switching between the list and the map does not cost them a tap every time.
 */
const RESUME_KEY = "kylling:geo-resume"

function rememberOptIn() {
  try {
    window.sessionStorage.setItem(RESUME_KEY, "1")
  } catch {
    // Private mode / blocked storage. Losing the resume is not worth an error.
  }
}

function hasOptedIn(): boolean {
  try {
    return window.sessionStorage.getItem(RESUME_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Geolocation is gated on a secure context: it works on https and on
 * localhost, and fails silently on plain http. Detect it, so we can say so
 * instead of just looking broken.
 */
function isSecureEnough(): boolean {
  if (typeof window === "undefined") return false
  if (typeof window.isSecureContext === "boolean") return window.isSecureContext
  const { protocol, hostname } = window.location
  return (
    protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1"
  )
}

function hasGeolocation(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "geolocation" in navigator &&
    typeof navigator.geolocation?.watchPosition === "function"
  )
}

export function useGeolocation(): GeolocationTracker {
  const [status, setStatus] = React.useState<GeoStatus>("idle")
  const [position, setPosition] = React.useState<PlayerPosition | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)

  const watchId = React.useRef<number | null>(null)
  // The error callback is stable and long-lived, so it reads the latest fix
  // from a ref rather than closing over stale state.
  const positionRef = React.useRef<PlayerPosition | null>(null)

  const stop = React.useCallback(() => {
    if (watchId.current === null) return
    if (hasGeolocation()) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
  }, [])

  const start = React.useCallback(() => {
    // Tapping again after a failure should genuinely retry, so an existing
    // watch is torn down first rather than being left to rot.
    stop()

    if (!isSecureEnough()) {
      setStatus("blocked")
      setMessage(MESSAGES.insecure)
      return
    }

    if (!hasGeolocation()) {
      setStatus("blocked")
      setMessage(MESSAGES.unsupported)
      return
    }

    rememberOptIn()
    setStatus("locating")
    setMessage(null)

    watchId.current = navigator.geolocation.watchPosition(
      (fix) => {
        const next: PlayerPosition = {
          lat: fix.coords.latitude,
          lng: fix.coords.longitude,
          accuracy: Number.isFinite(fix.coords.accuracy)
            ? fix.coords.accuracy
            : 0,
          at: fix.timestamp || Date.now(),
        }
        positionRef.current = next
        setPosition(next)
        setStatus("tracking")
        setMessage(null)
      },
      (error) => {
        // A watch re-fires this for as long as it runs, so it has to stay
        // quiet and idempotent: no toasts, and no state churn on a repeat.
        if (error.code === error.PERMISSION_DENIED) {
          // Nothing will change until the player changes it in the browser.
          stop()
          positionRef.current = null
          setPosition(null)
          setStatus("failed")
          setMessage(MESSAGES.denied)
          return
        }

        // A slightly stale dot beats no dot: once we have a fix, transient
        // "unavailable"/"timeout" noise is not worth alarming anyone over.
        // The watch stays alive and can still recover on its own.
        if (positionRef.current) return

        setStatus("failed")
        setMessage(
          error.code === error.TIMEOUT ? MESSAGES.timeout : MESSAGES.unavailable
        )
      },
      WATCH_OPTIONS
    )
  }, [stop])

  // A watch left running after unmount keeps the GPS warm for nothing.
  React.useEffect(() => stop, [stop])

  React.useEffect(() => {
    // Resume across a tab switch or a reload — but only when the player has
    // already tapped once in this tab *and* the permission is already granted.
    // "granted" is precisely the state in which watchPosition cannot raise a
    // prompt, so nothing can pop up unasked here.
    if (typeof window === "undefined" || !hasOptedIn()) return
    if (typeof navigator === "undefined") return

    const permissions = navigator.permissions
    if (!permissions || typeof permissions.query !== "function") return

    let cancelled = false
    permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (!cancelled && result.state === "granted") start()
      })
      .catch(() => {
        // Safari has been known to reject this query outright. Then we simply
        // wait for the tap, which is the documented path anyway.
      })

    return () => {
      cancelled = true
    }
  }, [start])

  return { status, position, message, start, stop }
}
