import { NextResponse } from "next/server";
import { notedVisitsById } from "@/data/noted-visits";
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
 * failed read now answers 200 with the bar list, flagged `degraded` so the
 * client knows the ticks are missing rather than absent, and refuses to write
 * while it lasts.
 *
 * The visits it does carry are whatever the group has reported out of band —
 * see `noted-visits.ts`. They stand in for the tally nobody can reach, and they
 * lose to the real thing the instant it is readable again.
 */
export async function GET() {
  try {
    const state = await getStateForDisplay();
    if (state) return NextResponse.json(toStateResponse(state));
    return NextResponse.json({
      ...toStateResponse({ ...emptyState(), visits: notedVisitsById() }),
      degraded: true,
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
