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
  // Zone 2, meldt ud ca. 18:01. Rykket ~300 m mod sydvest og skrumpet til det
  // halve. Målt samme vej som zone 1: billedet er zoomet 1,7× ind i forhold til
  // det forrige, hvilket giver 2,24 m/px. Venstre- og højrekant giver hver for
  // sig det samme centrum, og den lodrette udstrækning giver samme radius som
  // den vandrette — men det er stadig en aflæsning af et billede, ±150 m.
  { centre: { lat: 56.1558, lng: 10.2065 }, radius: 620 },
  // Zone 3, meldt ud ca. 18:28. Ind over den gamle bykerne. Målt mod to
  // uafhængige par — Trøjborgvej/Strandvejen og Langelandsgade/Park Allé — som
  // giver samme centrum inden for ~100 m og samme skala inden for 10%.
  { centre: { lat: 56.1576, lng: 10.2051 }, radius: 400 },
  // Zone 4, meldt ud 19:28 — finalcirklen.
  //
  // Først aflæst af billedet til (56.1571, 10.2061). Det var ~110 m for langt
  // sydvest og smed netop Klostertorvet ud, hvor kyllingen faktisk sad. Rettet
  // bagefter mod facit: centrum er nu de tre Klostertorvet-barers tyngdepunkt.
  //
  // Så det her er ikke længere en måling — det er en kalibrering mod et kendt
  // svar. Ved 80 m radius er en aflæsning af et satellitbillede på en telefon
  // simpelthen ikke præcis nok; label-ankrene alene bærer over 100 m slør.
  { centre: { lat: 56.1584, lng: 10.2063 }, radius: 80 },
]

/** Every zone announced tonight, oldest first. */
export function allZones(): Zone[] {
  return ZONES.map((zone, i) => ({ ...zone, number: i + 1 }))
}

/** The zone in force, or null while none has been announced. */
export function currentZone(): Zone | null {
  return allZones().at(-1) ?? null
}

/** How far outside the circle this position is. 0 means it is inside. */
export function metresOutside(zone: Zone, position: LatLng): number {
  return Math.max(0, metresBetween(zone.centre, position) - zone.radius)
}
