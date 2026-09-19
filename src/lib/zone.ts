// The zone: a circle that takes bars out of play for being outside it.
//
// There is deliberately no schedule here. Zones are announced during the game
// and we do not know when the first one lands, how many there will be, or in
// what form they will be given — so inventing a timetable would mean shipping a
// circle that is confidently wrong all evening. Until one is entered there is
// simply no zone, and nothing is excluded for being outside it.
//
// `ZONES` is the list as announced, newest last, and the newest is the one in
// force. Once the format is known this moves to server state alongside visits,
// so every phone sees the same circle; the rest of the app already reads it
// through `currentZone()` and will not need to change.

import { AARHUS_CENTRE, metresBetween, type LatLng } from "@/lib/maps"

export type Zone = {
  centre: LatLng
  radius: number
  /** 1-based: the third zone announced tonight is number 3. */
  number: number
}

/** Centre and radius of each zone as it was announced, oldest first. */
export type ZoneAnnouncement = { centre: LatLng; radius: number }

export const ZONES: ZoneAnnouncement[] = [
  // Zone 1, meldt ud ca. 16:47. Læst af satellitkortet i meldingen ved at måle
  // cirklens fire kanter mod kendte punkter: nordkanten mellem Nørre Stenbro og
  // Katrinebjerg, sydkanten ved Frederiksbjerg, østkanten ude i bugten øst for
  // Aarhus Ø, vestkanten lige vest for Ceres Byen. Alle fire passer på det
  // samme centrum og den samme radius, men det er en aflæsning af et billede —
  // regn med ±150 m, og se noten i svaret om hvilke barer det er tæt på.
  { centre: AARHUS_CENTRE, radius: 1250 },
]

/** The zone in force, or null while none has been announced. */
export function currentZone(): Zone | null {
  const latest = ZONES.at(-1)
  if (!latest) return null
  return { ...latest, number: ZONES.length }
}

/** How far outside the circle this position is. 0 means it is inside. */
export function metresOutside(zone: Zone, position: LatLng): number {
  return Math.max(0, metresBetween(zone.centre, position) - zone.radius)
}
