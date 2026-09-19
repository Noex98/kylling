// Shared contract between server store, API routes and UI.
// Keep this file stable — everything else depends on it.

/** 0 = Sunday ... 6 = Saturday (matches Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * An opening interval for one weekday. `close` may be "past midnight"
 * (e.g. open "20:00", close "05:00") — treat close <= open as next day.
 */
export type OpeningInterval = {
  open: string; // "HH:mm"
  close: string; // "HH:mm"
};

/** null = closed that day. */
export type OpeningHours = Record<Weekday, OpeningInterval | null>;

export type Bar = {
  id: string;
  name: string;
  address?: string;
  /** Free-text note: dress code, what to drink, etc. */
  note?: string;
  hours: OpeningHours;
  /** Bars added from the UI at runtime rather than from the seed file. */
  custom?: boolean;
};

export type Visit = {
  barId: string;
  /** ISO timestamp of when it was ticked off. */
  at: string;
};

/** The whole server-side game state. Serialised as-is to JSON. */
export type GameState = {
  /** Bars added at runtime (seed bars live in src/data/bars.ts). */
  customBars: Bar[];
  /** barId -> visit. Absence means "not visited". */
  visits: Record<string, Visit>;
  /** Bumped on every write so clients can cheaply detect changes. */
  rev: number;
  updatedAt: string;
};

export const emptyState = (): GameState => ({
  customBars: [],
  visits: {},
  rev: 0,
  updatedAt: new Date(0).toISOString(),
});

// ---------------------------------------------------------------------------
// API contract
// ---------------------------------------------------------------------------

/** GET /api/state -> StateResponse (bars = seed bars + custom bars, merged) */
export type StateResponse = {
  bars: Bar[];
  visits: Record<string, Visit>;
  rev: number;
  updatedAt: string;
  /** Server time, so clients agree on "is it open now" regardless of device clock. */
  serverNow: string;
};

/** POST /api/visits */
export type ToggleVisitRequest = {
  barId: string;
  visited: boolean;
};

/** POST /api/bars */
export type AddBarRequest = {
  name: string;
  address?: string;
  note?: string;
  hours?: Partial<OpeningHours>;
};

/** DELETE /api/bars?id=... — only custom bars can be deleted. */

export type ApiError = { error: string };
