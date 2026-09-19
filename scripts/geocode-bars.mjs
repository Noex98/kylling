// Geocodes every bar in src/data/bars.ts and writes src/data/coords.ts.
//
//   node scripts/geocode-bars.mjs
//
// Uses OpenStreetMap Nominatim, which is free and keyless but has a strict
// usage policy: a descriptive User-Agent and at most ONE request per second.
// We honour both, so a full run over ~105 bars takes a little over two minutes.
// That is expected — let it run.
//
// Results are biased to Denmark and a box around Aarhus, and anything landing
// outside that box is thrown away: a pin in the wrong country is worse than a
// missing pin. Bars that cannot be resolved are simply left out of coords.ts;
// the map handles missing entries.
//
// Re-runnable: it overwrites src/data/coords.ts cleanly every time.
// Relies on Node's built-in TypeScript type stripping (Node >= 22.18).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// --- config ----------------------------------------------------------------

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/** Nominatim asks that this identifies the application. Required by policy. */
const USER_AGENT =
  "kylling-bar-crawl/1.0 (find-the-chicken bar crawl app for Aarhus; one-off geocoding of ~105 bars)";

/** Minimum gap between requests, per the Nominatim usage policy. */
const REQUEST_INTERVAL_MS = 1100;

/** Search bias box around Aarhus: viewbox is lon1,lat1,lon2,lat2. */
const VIEWBOX = "10.0,56.3,10.4,56.0";

/** Anything outside this is discarded outright. */
const BOUNDS = { minLat: 56.0, maxLat: 56.3, minLng: 10.0, maxLng: 10.4 };

const BARS_FILE = new URL("../src/data/bars.ts", import.meta.url);
const OUT_FILE = new URL("../src/data/coords.ts", import.meta.url);

// --- helpers ---------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastRequestAt = 0;
async function throttle() {
  const wait = lastRequestAt + REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

const inBounds = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= BOUNDS.minLat &&
  lat <= BOUNDS.maxLat &&
  lng >= BOUNDS.minLng &&
  lng <= BOUNDS.maxLng;

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * "Store Torv 3, 8000 Aarhus C" -> "Store Torv 3, 8000 Aarhus, Denmark".
 * The Danish postal district suffix ("Aarhus C", "Aarhus N") is a postal
 * concept that Nominatim does not index as part of the place name, and
 * leaving it in makes some lookups miss.
 */
function normaliseAddress(address) {
  return `${address.trim().replace(/\bAarhus\s+[CNVS]\b/gi, "Aarhus")}, Denmark`;
}

/** Drops the house number, so we can at least land on the right street. */
function streetOnly(address) {
  const firstPart = address.split(",")[0].trim();
  const street = firstPart.replace(/\s+\d+\s*[A-Za-z]?\.?$/, "").trim();
  if (!street || street === firstPart) return null;
  return `${street}, Aarhus, Denmark`;
}

/**
 * The queries to try for one bar, best first. We stop at the first one that
 * yields a result inside the bounds.
 */
function queriesFor(bar) {
  const attempts = [];
  const address = bar.address?.trim();
  if (address) {
    attempts.push({ kind: "address", q: normaliseAddress(address) });
    attempts.push({ kind: "name", q: `${bar.name}, Aarhus, Denmark` });
    const street = streetOnly(address);
    if (street) attempts.push({ kind: "street", q: street });
  } else {
    attempts.push({ kind: "name", q: `${bar.name}, Aarhus, Denmark` });
  }
  return attempts;
}

async function nominatim(query) {
  const url = new URL(NOMINATIM);
  url.searchParams.set("format", "json");
  url.searchParams.set("q", query);
  url.searchParams.set("countrycodes", "dk");
  url.searchParams.set("viewbox", VIEWBOX);
  url.searchParams.set("bounded", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");

  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle();
    let response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "da,en" },
      });
    } catch (error) {
      if (attempt === 2) throw error;
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 2) return [];
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (!response.ok) return [];
    try {
      const json = await response.json();
      return Array.isArray(json) ? json : [];
    } catch {
      return [];
    }
  }
  return [];
}

// --- load the bars ---------------------------------------------------------

async function loadBars() {
  const { bars } = await import(BARS_FILE.href);
  return bars;
}

// --- output ----------------------------------------------------------------

function renderCoordsFile(resolved) {
  const lines = resolved.map(
    ({ bar, lat, lng }) =>
      `  ${JSON.stringify(bar.id)}: { lat: ${lat}, lng: ${lng} }, // ${bar.name}`,
  );
  return `// Latitude/longitude for the bar list, keyed by bar id.
//
// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/geocode-bars.mjs
//
// Source: OpenStreetMap Nominatim (ODbL), geocoded from each bar's address and
// filtered to a box around Aarhus. Bars that could not be geocoded are absent
// from this object rather than guessed at; the map skips whatever is missing.

import type { CoordsById } from "@/lib/maps";

export const coords: CoordsById = {
${lines.join("\n")}
};
`;
}

// --- main ------------------------------------------------------------------

const bars = await loadBars();
console.log(`Geocoding ${bars.length} bars via Nominatim (1 req/sec, be patient)...\n`);

const resolved = [];
const failed = [];
const viaFallback = [];

for (const [index, bar] of bars.entries()) {
  const position = `${String(index + 1).padStart(3)}/${bars.length}`;
  let hit = null;

  for (const attempt of queriesFor(bar)) {
    const results = await nominatim(attempt.q);
    const match = results.find((r) => inBounds(Number(r.lat), Number(r.lon)));
    if (match) {
      hit = {
        bar,
        lat: round6(Number(match.lat)),
        lng: round6(Number(match.lon)),
        kind: attempt.kind,
        query: attempt.q,
        displayName: match.display_name,
      };
      break;
    }
  }

  if (hit) {
    resolved.push(hit);
    if (hit.kind !== "address") viaFallback.push(hit);
    console.log(`${position} OK   ${bar.name} -> ${hit.lat},${hit.lng} [${hit.kind}]`);
  } else {
    failed.push(bar);
    console.log(`${position} MISS ${bar.name} (${bar.address ?? "no address"})`);
  }
}

writeFileSync(fileURLToPath(OUT_FILE), renderCoordsFile(resolved), "utf8");

// --- summary ---------------------------------------------------------------

console.log(`\n${"=".repeat(60)}`);
console.log(`resolved:     ${resolved.length}/${bars.length}`);
console.log(`failed:       ${failed.length}`);
if (failed.length) {
  for (const bar of failed) {
    console.log(`  - ${bar.id} (${bar.name}) ${bar.address ?? "— no address"}`);
  }
}

if (viaFallback.length) {
  console.log(`\nresolved via fallback query (worth eyeballing): ${viaFallback.length}`);
  for (const hit of viaFallback) {
    console.log(`  - ${hit.bar.id} [${hit.kind}] "${hit.query}" -> ${hit.displayName}`);
  }
}

// Several bars sharing one point usually means a street or city centroid match.
const byPoint = new Map();
for (const hit of resolved) {
  const key = `${hit.lat},${hit.lng}`;
  byPoint.set(key, [...(byPoint.get(key) ?? []), hit.bar.id]);
}
const clashes = [...byPoint].filter(([, ids]) => ids.length > 1);
if (clashes.length) {
  console.log(`\nidentical coordinates (possible centroid matches): ${clashes.length}`);
  for (const [point, ids] of clashes) console.log(`  - ${point}: ${ids.join(", ")}`);
}

console.log(`\nwrote ${fileURLToPath(OUT_FILE)}`);
