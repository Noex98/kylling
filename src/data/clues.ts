// Bars taken out of the game by a clue.
//
// Appended to as the clues land during the evening. Nothing is removed from
// bars.ts: a bar that is ruled out is still a bar, it just moves to the
// Udelukket list wearing the reason. That matters twice — if a clue turns out
// to be wrong the bar is one line away from being back in play, and the group
// keeps a record of where it has already been sent away from.

export type Clue = {
  /** Bars this clue takes out of the game. */
  barIds: string[]
  /** What the card says. Kept short — it sits on one line under the name. */
  note: string
}

/** Oldest clue first. */
export const clues: Clue[] = [
  {
    // Meldt ud ca. 18:05.
    barIds: [
      "cafe-smagloes",
      "gedulgt",
      "mig-og-oelsnedkeren",
      "ris-ras",
      "salling-rooftop",
      "vin-og-petanque",
    ],
    note: "Udelukket af en ledetråd",
  },
  {
    // Meldt ud ca. 18:25.
    barIds: ["sherlock-holmes-pub"],
    note: "Udelukket af en ledetråd",
  },
]

/** The clue that ruled this bar out, or undefined if none has. */
export function clueFor(barId: string): Clue | undefined {
  return clues.find((clue) => clue.barIds.includes(barId))
}
