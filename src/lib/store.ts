// Server-side game state, shared by every visitor, stored in Vercel Blob.
//
// Every write goes to a NEW pathname carrying its revision, rather than
// overwriting one file. Blob content is served through a CDN, and overwriting a
// stable URL meant a read could get a cached copy from before the last write —
// so ticking a bar and reloading showed it unticked, until the CDN caught up
// and it flipped back. Revision-stamped names make each URL immutable, so
// caching becomes correct and even useful: `list()` is a metadata API call and
// is consistent, so it always names the newest revision.
//
// All writes go through a single in-process promise chain, so concurrent
// requests can never read-modify-write over each other.

import { del, list, put } from "@vercel/blob";
import { bars } from "@/data/bars";
import { emptyState, type GameState, type StateResponse } from "@/lib/types";

const BLOB_PREFIX = "kylling/state-";

/** Zero-padded so lexical order matches numeric order. */
const pathFor = (rev: number) =>
  `${BLOB_PREFIX}${String(rev).padStart(12, "0")}.json`;

/** How many superseded revisions to keep before tidying up. */
const KEEP_REVISIONS = 3;

/** Thrown when the state cannot be read or written. Routes map it to a 503. */
export class StoreUnavailableError extends Error {
  readonly code = "STORE_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "StoreUnavailableError";
  }
}

/**
 * The SDK authenticates either with BLOB_READ_WRITE_TOKEN or, on Vercel, with
 * the project's OIDC credentials — in which case no token env var exists at
 * all. So we cannot check configuration up front; we let the SDK try and turn
 * whatever it complains about into a message a player can act on.
 */
function asStoreUnavailable(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new StoreUnavailableError(
    `Serveren kan ikke tilgå spillets data: ${message}`,
  );
}

/** Defensive parse — the stored document may be missing, stale or hand-edited. */
function normalise(raw: unknown): GameState {
  const base = emptyState();
  const value = typeof raw === "string" ? safeParse(raw) : raw;
  if (!value || typeof value !== "object") return base;
  const s = value as Partial<GameState>;
  return {
    customBars: Array.isArray(s.customBars) ? s.customBars : base.customBars,
    visits: s.visits && typeof s.visits === "object" ? s.visits : base.visits,
    rev: typeof s.rev === "number" ? s.rev : base.rev,
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : base.updatedAt,
  };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

type Revision = { pathname: string; url: string };

/** Every stored revision, newest first. `list()` is consistent; the CDN is not. */
async function listRevisions(): Promise<Revision[]> {
  try {
    const { blobs } = await list({ prefix: BLOB_PREFIX });
    return blobs
      .map(({ pathname, url }) => ({ pathname, url }))
      .sort((a, b) => b.pathname.localeCompare(a.pathname));
  } catch (err) {
    throw asStoreUnavailable(err);
  }
}

async function read(): Promise<GameState> {
  const [newest] = await listRevisions();
  // Nothing stored yet — the first write creates it.
  if (!newest) return emptyState();
  // This URL's content never changes, so a cached copy is the right answer.
  const res = await fetch(newest.url);
  if (res.status === 404) return emptyState();
  if (!res.ok) {
    throw new StoreUnavailableError(
      `Kunne ikke hente spillets tilstand (HTTP ${res.status}).`,
    );
  }
  return normalise(await res.text());
}

async function write(state: GameState): Promise<void> {
  try {
    await put(pathFor(state.rev), JSON.stringify(state), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (err) {
    throw asStoreUnavailable(err);
  }
  void prune();
}

/**
 * Drop superseded revisions. Not awaited by the caller — a slow cleanup must
 * never delay a player's tick — and failures are swallowed, since stale blobs
 * are harmless clutter. A few are kept so a read that raced this deletion still
 * finds the revision it was told about.
 */
async function prune(): Promise<void> {
  try {
    const revisions = await listRevisions();
    const stale = revisions.slice(KEEP_REVISIONS);
    if (stale.length) await del(stale.map((r) => r.url));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Serialises every mutation, so read-modify-write stays atomic in-process. */
let chain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

export async function getState(): Promise<GameState> {
  return read();
}

/**
 * Applies `fn` to a copy of the current state, bumps `rev`, stamps `updatedAt`,
 * persists and returns the new state. `fn` may mutate its argument or return a
 * replacement state.
 */
export async function updateState(
  fn: (state: GameState) => GameState | void,
): Promise<GameState> {
  return withLock(async () => {
    const current = await read();
    const draft = structuredClone(current);
    const applied = (fn(draft) as GameState | undefined) ?? draft;
    const next: GameState = {
      ...applied,
      rev: current.rev + 1,
      updatedAt: new Date().toISOString(),
    };
    await write(next);
    return next;
  });
}

/** The shape every route responds with: seed bars + custom bars, plus server time. */
export function toStateResponse(state: GameState): StateResponse {
  return {
    bars: [...bars, ...state.customBars],
    visits: state.visits,
    rev: state.rev,
    updatedAt: state.updatedAt,
    serverNow: new Date().toISOString(),
  };
}
