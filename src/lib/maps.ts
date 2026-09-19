import type { Bar } from "@/lib/types";

/** Latitude/longitude for a bar, keyed by bar id in @/data/coords. */
export type LatLng = { lat: number; lng: number };
export type CoordsById = Record<string, LatLng>;

/** Roughly the middle of Aarhus C — the map's default centre. */
export const AARHUS_CENTRE: LatLng = { lat: 56.1567, lng: 10.2108 };

const EARTH_RADIUS_M = 6_371_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in metres. Every bar in the game is within 1.5 km of
 * every other one, so the curvature correction is far below the accuracy of the
 * geocoding — but haversine is three lines and removes the question.
 */
export function metresBetween(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * A Google Maps link that needs no API key and opens the native app on a
 * phone. Searching by name + address beats linking coordinates: it lands on
 * the venue's own place card, with its photos, reviews and current hours.
 */
export function googleMapsUrl(bar: Bar): string {
  const query = [bar.name, bar.address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Walking directions from wherever the player is standing to the bar. */
export function googleMapsDirectionsUrl(bar: Bar): string {
  const query = [bar.name, bar.address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${encodeURIComponent(query)}`;
}
