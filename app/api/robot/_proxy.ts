import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export async function proxy(req: NextRequest, path: string) {
  const expected = process.env.ROBOT_APP_ACCESS_KEY || "";
  const key = req.headers.get("x-robot-access-key") || "";
  const a = Buffer.from(expected), b = Buffer.from(key);
  if (expected.length < 24 || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Sai khóa điều khiển" }, { status: 401 });
  }
  const base = process.env.ROBOT_BRIDGE_URL;
  const token = process.env.ROBOT_TOKEN;
  if (!base?.startsWith("https://") || !token || token.length < 24) {
    return NextResponse.json({ error: "Chưa cấu hình kết nối Python" }, { status: 503 });
  }
  let payload: unknown;
  if (req.method === "POST") {
    try { payload = await req.json(); }
    catch { return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 }); }
  }
  try {
    const result = await fetch(`${base.replace(/\/$/, "")}/${path}`, {
      method: req.method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      cache: "no-store", signal: AbortSignal.timeout(7000), redirect: "error",
    });
    const body = await result.json();
    return NextResponse.json(body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Không liên lạc được với Python" }, { status: 502 });
  }
}
