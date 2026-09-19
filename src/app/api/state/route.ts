import { NextResponse } from "next/server";
import { storeErrorResponse } from "@/lib/api-error";
import { getState, toStateResponse } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    return NextResponse.json(toStateResponse(await getState()));
  } catch (err) {
    return storeErrorResponse(err);
  }
}
