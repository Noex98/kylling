import { NextResponse } from "next/server";
import { storeErrorResponse } from "@/lib/api-error";
import { getStateForDisplay, toStateResponse } from "@/lib/store";
import { emptyState } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Answers even when the shared store is unreachable.
 *
 * A dead store used to mean a dead app: no bars, no hours, no map, no zone —
 * although every one of those lives in code and was never in any danger. So a
 * failed read now answers 200 with the bar list and an empty `visits`, flagged
 * `degraded` so the client knows the ticks are missing rather than absent, and
 * refuses to write while it lasts.
 */
export async function GET() {
  try {
    const state = await getStateForDisplay();
    if (state) return NextResponse.json(toStateResponse(state));
    return NextResponse.json({
      ...toStateResponse(emptyState()),
      degraded: true,
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
