// Sanity check on the bar dataset. Run: node scripts/check-bars.mjs
// Six agents wrote the six part files independently, so the things most likely
// to be wrong are duplicate ids across parts and missing weekday keys.
// Relies on Node's built-in TypeScript type stripping (Node >= 22.18).
import { readdirSync } from "node:fs";

const dir = new URL("../src/data/parts/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".ts")).sort();

const bars = [];
for (const file of files) {
  const mod = await import(new URL(file, dir).href);
  const exported = Object.values(mod).find(Array.isArray);
  if (!exported) {
    console.error(`${file}: no exported array found`);
    process.exit(1);
  }
  for (const bar of exported) bars.push({ ...bar, _file: file });
}

const problems = [];
const seen = new Map();
for (const bar of bars) {
  if (seen.has(bar.id)) {
    problems.push(`duplicate id "${bar.id}": ${seen.get(bar.id)._file} and ${bar._file}`);
  }
  seen.set(bar.id, bar);

  if (!bar.name?.trim()) problems.push(`${bar._file}: missing name`);

  for (const day of [0, 1, 2, 3, 4, 5, 6]) {
    if (!(day in (bar.hours ?? {}))) {
      problems.push(`${bar.id}: missing weekday key ${day}`);
      continue;
    }
    const interval = bar.hours[day];
    if (interval === null) continue;
    for (const key of ["open", "close"]) {
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(interval[key] ?? "")) {
        problems.push(`${bar.id}: bad ${key} "${interval[key]}" on day ${day}`);
      }
    }
  }
}

const byName = new Map();
for (const bar of bars) {
  const key = bar.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (byName.has(key)) problems.push(`duplicate name "${bar.name}" (${byName.get(key).id} / ${bar.id})`);
  byName.set(key, bar);
}

const unconfirmed = bars.filter((b) => /bekræftet|verificeret|estimer|usikker/i.test(b.note ?? ""));
const noAddress = bars.filter((b) => !b.address?.trim());
const neverOpen = bars.filter((b) => [0, 1, 2, 3, 4, 5, 6].every((d) => !b.hours?.[d]));

console.log(`files:        ${files.join(", ")}`);
console.log(`bars:         ${bars.length}`);
console.log(`unconfirmed:  ${unconfirmed.length}`);
console.log(`no address:   ${noAddress.map((b) => b.name).join(", ") || "none"}`);
console.log(`never open:   ${neverOpen.map((b) => b.id).join(", ") || "none"}`);
console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n` + problems.join("\n") : "\nNo problems found.");
process.exit(problems.length ? 1 : 0);
