import {isSameOrigin} from "@/lib/firebase-trash";
import {parseModalResult} from "@/lib/trash-vision";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({error: "Nguồn yêu cầu không hợp lệ"}, {status: 403});
  const base = process.env.NEXT_PUBLIC_MODAL_AI_URL?.trim().replace(/\/$/, "");
  if (!base) return Response.json({error: "App chưa có cấu hình dịch vụ nhận diện Modal"}, {status: 503});
  if (Number(request.headers.get("content-length")) > 4000000)
    return Response.json({error: "Ảnh quá lớn"}, {status: 413});
  let form: FormData, image: File, width: number, height: number;
  try {
    form = await request.formData();
    const file = form.get("image");
    width = Number(form.get("width")); height = Number(form.get("height"));
    if (!(file instanceof File) || file.type !== "image/jpeg" || file.size < 4 || file.size > 3500000 ||
        !Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width > 1920 || height > 1920)
      throw new Error("Ảnh camera không hợp lệ");
    image = file;
    const bytes = new Uint8Array(await image.slice(0, 3).arrayBuffer());
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new Error("Ảnh phải là JPEG");
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : "Không đọc được ảnh"}, {status: 400});
  }
  try {
    const body = new FormData(); body.append("image", image, "frame.jpg");
    const response = await fetch(base + "/detect", {method: "POST", body, signal: AbortSignal.timeout(100000)});
    if (!response.ok) throw new Error("Dịch vụ AI chưa xử lý được ảnh. Hãy thử lại.");
    const objects = parseModalResult(await response.json(), {width, height});
    return Response.json({objects}, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    console.error("Frame recognition failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({error: error instanceof Error && error.name !== "TimeoutError" ? error.message : "AI xử lý quá lâu. Hãy thử lại."}, {status: 502});
  }
}
