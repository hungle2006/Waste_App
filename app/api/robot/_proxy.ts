import { NextRequest, NextResponse } from "next/server";

export async function proxy(req: NextRequest, path: string) {
  return NextResponse.json({ error: "App hiện dùng Supabase Realtime. Cập nhật trang và chạy bộ Python Realtime mới.",
    transport: "supabase" }, { status: 410 });
}
