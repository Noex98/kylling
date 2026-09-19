import type { Bar } from "@/lib/types";

/** Latitude/longitude for a bar, keyed by bar id in @/data/coords. */
export type LatLng = { lat: number; lng: number };
export type CoordsById = Record<string, LatLng>;

/** Roughly the middle of Aarhus C — the map's default centre. */
export const AARHUS_CENTRE: LatLng = { lat: 56.1567, lng: 10.2108 };

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
