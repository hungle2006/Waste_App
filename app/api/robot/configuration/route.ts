import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json({ configured: Boolean(
    process.env.ROBOT_BRIDGE_URL?.startsWith("https://") &&
    (process.env.ROBOT_TOKEN?.length || 0) >= 24 &&
    (process.env.ROBOT_APP_ACCESS_KEY?.length || 0) >= 24
  ) }, { headers: { "Cache-Control": "no-store" } });
}
