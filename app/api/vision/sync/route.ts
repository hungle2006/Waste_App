export const dynamic = "force-dynamic";

// Keep the old URL closed so already-open tabs cannot write through it.
export async function POST() {
  return Response.json(
    {synced: false, disabled: true, error: "Đồng bộ Firebase đã được tắt."},
    {status: 410, headers: {"Cache-Control": "no-store"}},
  );
}
