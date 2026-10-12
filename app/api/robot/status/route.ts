import { NextRequest } from "next/server";
import { proxy } from "../_proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(req: NextRequest) { return proxy(req, "status"); }
