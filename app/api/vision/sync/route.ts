import {countObjects, parseObjects} from "@/lib/trash-vision";
import {isSameOrigin, writeTrashCounts} from "@/lib/firebase-trash";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({error: "Nguồn yêu cầu không hợp lệ"}, {status: 403});
  if (Number(request.headers.get("content-length")) > 24000)
    return Response.json({error: "Dữ liệu quá lớn"}, {status: 413});
  let counts;
  try {
    const text = await request.text();
    if (text.length > 24000) throw new Error("Dữ liệu quá lớn");
    const data = JSON.parse(text);
    if (!Number.isFinite(data.observedAt) || Math.abs(Date.now() - data.observedAt) > 30000)
      throw new Error("Kết quả nhận diện đã cũ; chờ ảnh mới");
    counts = countObjects(parseObjects(data.objects));
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : "Dữ liệu không hợp lệ"}, {status: 400});
  }
  try {
    await writeTrashCounts(counts);
    return Response.json({synced: true, counts}, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    return Response.json({synced: false, error: error instanceof Error ? error.message : "Lỗi đồng bộ Firebase"}, {status: 502});
  }
}
