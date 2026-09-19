import { NextResponse } from "next/server";
import { storeErrorResponse } from "@/lib/api-error";
import { toStateResponse, updateState } from "@/lib/store";
import type { ToggleVisitRequest } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { barId, visited, by } = (body ?? {}) as Partial<ToggleVisitRequest>;

  if (typeof barId !== "string" || !barId.trim()) {
    return NextResponse.json({ error: "barId is required" }, { status: 400 });
  }
  if (typeof visited !== "boolean") {
    return NextResponse.json(
      { error: "visited must be a boolean" },
      { status: 400 },
    );
  }
  if (by !== undefined && typeof by !== "string") {
    return NextResponse.json({ error: "by must be a string" }, { status: 400 });
  }
  const id = barId.trim();
  try {
    const state = await updateState((s) => {
      if (!visited) {
        delete s.visits[id];
        return;
      }
      // Re-ticking an already-visited bar keeps the original timestamp and
      // name rather than resetting them.
      const existing = s.visits[id];
      s.visits[id] = {
        barId: id,
        at: existing?.at ?? new Date().toISOString(),
        by: by?.trim() || existing?.by,
      };
    });

    return NextResponse.json(toStateResponse(state));
  } catch (err) {
    return storeErrorResponse(err);
  }
}
