import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const room = process.env.NEXT_PUBLIC_ROBOT_ID || "robot_01";

  if (!url || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Missing LIVEKIT_URL, LIVEKIT_API_KEY or LIVEKIT_API_SECRET" },
      { status: 500 }
    );
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: `web-${crypto.randomUUID()}`,
    ttl: "10m",
  });

  token.addGrant({
    roomJoin: true,
    room,
    canSubscribe: true,
    canPublish: false,
    canPublishData: false,
  });

  return NextResponse.json(
    {
      url,
      room,
      token: await token.toJwt(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
