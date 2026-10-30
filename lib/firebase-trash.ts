import type {TrashCounts} from "./trash-vision";

export const FIREBASE_TRASH_PATH = "Robot thu gom 1/TrashClasses";
const DATABASE = "https://smart-genaiot-default-rtdb.asia-southeast1.firebasedatabase.app";

/** Current scene counts, not a cumulative counter. Only these four children are patched. */
export async function writeTrashCounts(counts: TrashCounts) {
  const url = `${DATABASE}/${FIREBASE_TRASH_PATH.split("/").map(encodeURIComponent).join("/")}.json`;
  const response = await fetch(url, {method: "PATCH", headers: {"Content-Type": "application/json"},
    body: JSON.stringify(counts), cache: "no-store", signal: AbortSignal.timeout(10000)});
  if (!response.ok) {
    console.error("Firebase TrashClasses write failed", response.status);
    throw new Error(response.status === 401 || response.status === 403
      ? "Firebase chưa cho phép ghi TrashClasses. Cần kiểm tra quyền ghi của dự án."
      : "Chưa đồng bộ được Firebase; hệ thống sẽ thử lại.");
  }
  return counts;
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === (request.headers.get("host") || new URL(request.url).host); }
  catch { return false; }
}
