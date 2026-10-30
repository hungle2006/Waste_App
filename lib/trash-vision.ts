export const TRASH_TYPES = [
  {bin: 1, field: "Recyclable", title: "Tái chế", color: "#34d399"},
  {bin: 2, field: "Organic", title: "Hữu cơ", color: "#a3e635"},
  {bin: 3, field: "Hazardous", title: "Nguy hại", color: "#fbbf24"},
  {bin: 4, field: "Others", title: "Rác khác", color: "#94a3b8"},
] as const;

export type TrashCounts = Record<(typeof TRASH_TYPES)[number]["field"], number>;
export type TrashObject = {label: string; bin: number; bbox?: [number, number, number, number]};
export type VisionFrame = {url: string; width: number; height: number; objects: TrashObject[]; capturedAt: number};

export function parseObjects(value: unknown, frame?: {width: number; height: number}): TrashObject[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Danh sách nhận diện không hợp lệ");
  return value.map(item => {
    if (!item || typeof item !== "object" || typeof item.label !== "string" ||
        !item.label.trim() || item.label.length > 160 || !TRASH_TYPES.some(t => t.bin === item.bin))
      throw new Error("Kết quả nhận diện thiếu nhãn hoặc sai loại rác");
    const object: TrashObject = {label: item.label.trim(), bin: item.bin};
    if (item.bbox !== undefined) {
      const b = item.bbox;
      if (!Array.isArray(b) || b.length !== 4 || b.some(v => typeof v !== "number" || !Number.isFinite(v)) ||
          b[0] < 0 || b[1] < 0 || b[0] >= b[2] || b[1] >= b[3] ||
          (frame && (b[2] > frame.width || b[3] > frame.height)))
        throw new Error("Tọa độ khung nhận diện không hợp lệ");
      object.bbox = b as TrashObject["bbox"];
    }
    return object;
  });
}

export function countObjects(objects: TrashObject[]): TrashCounts {
  const counts: TrashCounts = {Hazardous: 0, Organic: 0, Others: 0, Recyclable: 0};
  for (const object of objects) {
    const category = TRASH_TYPES.find(t => t.bin === object.bin);
    if (!category) throw new Error("Mã ngăn rác không hợp lệ");
    counts[category.field]++;
  }
  return counts;
}

export function parseModalResult(data: unknown, frame: {width: number; height: number}) {
  if (!data || typeof data !== "object" || !("found" in data) || typeof data.found !== "boolean")
    throw new Error("Dịch vụ AI trả dữ liệu không hợp lệ");
  const value = data as {found: boolean; objects?: unknown; object?: unknown};
  const objects = parseObjects(value.objects ?? (value.object ? [value.object] : []), frame);
  if (value.found !== (objects.length > 0)) throw new Error("Kết quả AI không khớp danh sách vật");
  return objects;
}
