import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  return NextResponse.json({ configured: Boolean(url && publishableKey), transport: "supabase",
    robotId: process.env.NEXT_PUBLIC_ROBOT_ID?.trim() || "robot_01",
    supabase: { url, publishableKey },
    modalAiUrl: process.env.NEXT_PUBLIC_MODAL_AI_URL?.trim() || "",
    livekit: { configured: Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
      trackName: process.env.NEXT_PUBLIC_CAMERA_TRACK_NAME?.trim() || "front_camera" },
    protocol: "mechanics-realtime-v1",
  }, { headers: { "Cache-Control": "no-store" } });
}
