// Server-side game state, shared by every visitor, stored as a single JSON
// document in Vercel Blob.
//
// Requires BLOB_READ_WRITE_TOKEN. On Vercel it is set for you once a Blob store
// is connected to the project; locally, `vercel env pull .env.local` fetches it.
//
// All writes go through a single in-process promise chain, so concurrent
// requests can never read-modify-write over each other.

import { list, put } from "@vercel/blob";
import { bars } from "@/data/bars";
import { emptyState, type GameState, type StateResponse } from "@/lib/types";

const BLOB_PATH = "kylling/state.json";

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

/** The blob's public URL, which only changes if the store is recreated. */
let blobUrl: string | null = null;

async function resolveUrl(): Promise<string | null> {
  if (blobUrl) return blobUrl;
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    blobUrl = blobs.find((b) => b.pathname === BLOB_PATH)?.url ?? null;
  } catch (err) {
    throw asStoreUnavailable(err);
  }
  return blobUrl;
}

async function read(): Promise<GameState> {
  const url = await resolveUrl();
  // Nothing stored yet — the first write creates it.
  if (!url) return emptyState();
  // Bypass the CDN, or players poll a document that is minutes out of date.
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (res.status === 404) {
    blobUrl = null;
    return emptyState();
  }
  if (!res.ok) {
    throw new StoreUnavailableError(
      `Kunne ikke hente spillets tilstand (HTTP ${res.status}).`,
    );
  }
  return normalise(await res.text());
}

async function write(state: GameState): Promise<void> {
  try {
    const { url } = await put(BLOB_PATH, JSON.stringify(state), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
    blobUrl = url;
  } catch (err) {
    throw asStoreUnavailable(err);
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
