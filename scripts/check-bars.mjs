// Sanity check on the bar dataset. Run: node scripts/check-bars.mjs
// Guards against duplicate ids, missing weekdays, malformed times and bars
// that are never open. Relies on Node's TypeScript type stripping (Node >= 22.18).

const { bars } = await import(new URL("../src/data/bars.ts", import.meta.url).href);
const { coords } = await import(new URL("../src/data/coords.ts", import.meta.url).href);

const problems = [];
const seen = new Map();

for (const bar of bars) {
  if (seen.has(bar.id)) problems.push(`duplicate id "${bar.id}"`);
  seen.set(bar.id, bar);

  if (!bar.name?.trim()) problems.push(`${bar.id}: missing name`);

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
  if (byName.has(key)) {
    problems.push(`duplicate name "${bar.name}" (${byName.get(key).id} / ${bar.id})`);
  }
  byName.set(key, bar);
}

const missingCoords = bars.filter((b) => !coords[b.id]);
const orphanCoords = Object.keys(coords).filter((id) => !seen.has(id));
for (const id of orphanCoords) problems.push(`coords has unknown bar id "${id}"`);

const unconfirmed = bars.filter((b) => /bekræftet|verificeret|estimer|usikker/i.test(b.note ?? ""));
const noAddress = bars.filter((b) => !b.address?.trim());
const neverOpen = bars.filter((b) => [0, 1, 2, 3, 4, 5, 6].every((d) => !b.hours?.[d]));

console.log(`bars:            ${bars.length}`);
console.log(`with coords:     ${bars.length - missingCoords.length}`);
console.log(`unconfirmed:     ${unconfirmed.length}`);
console.log(`no address:      ${noAddress.map((b) => b.name).join(", ") || "none"}`);
console.log(`never open:      ${neverOpen.map((b) => b.id).join(", ") || "none"}`);
if (missingCoords.length) {
  console.log(`missing coords:  ${missingCoords.map((b) => b.id).join(", ")}`);
}
console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n` + problems.join("\n") : "\nNo problems found.");
process.exit(problems.length ? 1 : 0);
