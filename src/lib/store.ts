// Server-side game state, shared by every visitor.
//
// Three interchangeable backends behind one async interface, picked from env:
//   - BLOB_READ_WRITE_TOKEN set            -> Vercel Blob   (one click on Vercel)
//   - UPSTASH_REDIS_REST_* set             -> Upstash Redis
//   - neither                              -> a JSON file at <cwd>/data/state.json
//
// The file backend is the zero-setup default and is right for local dev or a
// single long-running container. It cannot work on a serverless host, whose
// filesystem is read-only — see asStoreUnavailable below.
//
// All writes go through a single in-process promise chain, so concurrent
// requests can never read-modify-write over each other.

import { promises as fs } from "node:fs";
import path from "node:path";
import { bars } from "@/data/bars";
import { emptyState, type GameState, type StateResponse } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const REDIS_KEY = "kylling:state";

type Backend = {
  read: () => Promise<GameState>;
  write: (state: GameState) => Promise<void>;
};

/** Defensive parse — the file (or Redis value) may be missing, stale or hand-edited. */
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

// ---------------------------------------------------------------------------
// File backend
// ---------------------------------------------------------------------------

/** Module-level cache, invalidated when the file changes underneath us. */
let cache: { state: GameState; mtimeMs: number; size: number } | null = null;

/** Windows occasionally fails a rename while an indexer/AV holds the file. */
async function rename(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

const fileBackend: Backend = {
  async read() {
    let stat;
    try {
      stat = await fs.stat(STATE_FILE);
    } catch {
      // No file yet — it gets created on the first write.
      cache = null;
      return emptyState();
    }
    if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) {
      return cache.state;
    }
    const state = normalise(await fs.readFile(STATE_FILE, "utf8"));
    cache = { state, mtimeMs: stat.mtimeMs, size: stat.size };
    return state;
  },

  async write(state) {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
      await rename(tmp, STATE_FILE);
    } catch (err) {
      throw asStoreUnavailable(err);
    }
    const stat = await fs.stat(STATE_FILE);
    cache = { state, mtimeMs: stat.mtimeMs, size: stat.size };
  },
};

/**
 * Serverless hosts (Vercel, Netlify, Cloudflare) give each instance a read-only
 * filesystem, so the file backend can read but never write — reads succeed and
 * every tick fails. That used to surface as a bare 500, which says nothing.
 * Turn it into an error the UI can actually show a player.
 */
function asStoreUnavailable(err: unknown): Error {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code !== "EROFS" && code !== "EACCES" && code !== "EPERM") {
    return err as Error;
  }
  return new StoreUnavailableError(
    "Serveren kan ikke gemme afkrydsninger: filsystemet er skrivebeskyttet. " +
      "Appen skal have et delt lager — tilføj Vercel Blob (BLOB_READ_WRITE_TOKEN) " +
      "eller Upstash Redis, og deploy igen. Se README.",
  );
}

/** Thrown when the state cannot be persisted at all. Routes map it to a 503. */
export class StoreUnavailableError extends Error {
  readonly code = "STORE_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "StoreUnavailableError";
  }
}

// ---------------------------------------------------------------------------
// Redis backend (imported lazily so the file backend needs no dependency)
// ---------------------------------------------------------------------------

async function createRedis() {
  const { Redis } = await import("@upstash/redis");
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

let redis: Promise<Awaited<ReturnType<typeof createRedis>>> | null = null;

const getRedis = () => (redis ??= createRedis());

const redisBackend: Backend = {
  async read() {
    const client = await getRedis();
    return normalise(await client.get(REDIS_KEY));
  },

  async write(state) {
    const client = await getRedis();
    await client.set(REDIS_KEY, state);
  },
};

// ---------------------------------------------------------------------------
// Vercel Blob backend (also imported lazily)
// ---------------------------------------------------------------------------

const BLOB_PATH = "kylling/state.json";

/**
 * `put` with `allowOverwrite` keeps the state at one stable pathname, and
 * `addRandomSuffix: false` means we can read it back by URL without listing.
 * Reads bypass the CDN cache (`cache: "no-store"` + a cache-busting query), or
 * players would poll a stale copy for minutes.
 */
const blobBackend: Backend = {
  async read() {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    const blob = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!blob) return emptyState();
    const res = await fetch(`${blob.url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return emptyState();
    return normalise(await res.text());
  },

  async write(state) {
    const { put } = await import("@vercel/blob");
    await put(BLOB_PATH, JSON.stringify(state), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
  },
};

const backend = (): Backend => {
  if (process.env.BLOB_READ_WRITE_TOKEN) return blobBackend;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return redisBackend;
  }
  return fileBackend;
};

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
  return backend().read();
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
    const store = backend();
    const current = await store.read();
    const draft = structuredClone(current);
    const applied = (fn(draft) as GameState | undefined) ?? draft;
    const next: GameState = {
      ...applied,
      rev: current.rev + 1,
      updatedAt: new Date().toISOString(),
    };
    await store.write(next);
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
