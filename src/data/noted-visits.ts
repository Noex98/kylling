// Ticks reported out of band while the shared store was unreachable.
//
// The degraded banner tells the group to write their ticks down during an
// outage. This is where they get written down, so the tally on everyone's phone
// is at least the truth as far as anyone has said it out loud.
//
// These are served ONLY in degraded mode. The moment the store answers again
// the real visits take over and this list is ignored entirely — it is a note on
// a napkin, not state, and it must never win over the thing it stands in for.
// Anything noted here still has to be written to the store once it is back.

import type { Visit } from "@/lib/types";

export const notedVisits: Visit[] = [
  // Meldt ind ca. 18:15, mens Blob var nede for anden gang.
  { barId: "aarhus-street-food", at: "2026-09-19T16:15:00.000Z" },
];

/** The noted ticks in the shape the API answers with. */
export function notedVisitsById(): Record<string, Visit> {
  return Object.fromEntries(notedVisits.map((visit) => [visit.barId, visit]));
}
