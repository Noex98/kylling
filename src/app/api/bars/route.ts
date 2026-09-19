import { NextResponse } from "next/server";
import { bars } from "@/data/bars";
import { getState, toStateResponse, updateState } from "@/lib/store";
import type {
  AddBarRequest,
  OpeningHours,
  OpeningInterval,
  Weekday,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "Café Kølle & Høne" -> "cafe-koelle-hoene" */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "bar";
}

/** Fills in every weekday (missing = null = closed). Returns null if malformed. */
function normaliseHours(raw: unknown): OpeningHours | null {
  const source = (raw && typeof raw === "object" ? raw : {}) as Partial<OpeningHours>;
  const hours = {} as OpeningHours;
  for (const day of WEEKDAYS) {
    const interval = source[day] as OpeningInterval | null | undefined;
    if (interval == null) {
      hours[day] = null;
      continue;
    }
    if (
      typeof interval !== "object" ||
      !TIME.test(interval.open) ||
      !TIME.test(interval.close)
    ) {
      return null;
    }
    hours[day] = { open: interval.open, close: interval.close };
  }
  return hours;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, address, note, hours } = (body ?? {}) as Partial<AddBarRequest>;

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (address !== undefined && typeof address !== "string") {
    return NextResponse.json(
      { error: "address must be a string" },
      { status: 400 },
    );
  }
  if (note !== undefined && typeof note !== "string") {
    return NextResponse.json({ error: "note must be a string" }, { status: 400 });
  }

  const openingHours = normaliseHours(hours);
  if (!openingHours) {
    return NextResponse.json(
      { error: 'hours must map a weekday to null or { open: "HH:mm", close: "HH:mm" }' },
      { status: 400 },
    );
  }

  const state = await updateState((s) => {
    const taken = new Set([...bars, ...s.customBars].map((bar) => bar.id));
    const base = slugify(name);
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;

    s.customBars.push({
      id,
      name: name.trim(),
      address: address?.trim() || undefined,
      note: note?.trim() || undefined,
      hours: openingHours,
      custom: true,
    });
  });

  return NextResponse.json(toStateResponse(state));
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const current = await getState();
  if (!current.customBars.some((bar) => bar.id === id)) {
    const isSeed = bars.some((bar) => bar.id === id);
    return NextResponse.json(
      { error: isSeed ? "Seed bars cannot be deleted" : `Unknown bar: ${id}` },
      { status: 404 },
    );
  }

  const state = await updateState((s) => {
    s.customBars = s.customBars.filter((bar) => bar.id !== id);
    delete s.visits[id];
  });

  return NextResponse.json(toStateResponse(state));
}
