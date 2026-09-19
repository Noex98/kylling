import { NextResponse } from "next/server";
import { StoreUnavailableError } from "@/lib/store";

/**
 * Every write route funnels failures through here, so a misconfigured host
 * tells the player what is wrong instead of returning a bare 500.
 */
export function storeErrorResponse(err: unknown) {
  if (err instanceof StoreUnavailableError) {
    console.error("[api] state store unavailable:", err.message);
    return NextResponse.json({ error: err.message }, { status: 503 });
  }
  console.error("[api] unexpected error:", err);
  return NextResponse.json(
    { error: "Uventet serverfejl. Prøv igen." },
    { status: 500 },
  );
}
