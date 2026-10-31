"use client";
import {useEffect, useRef, useState} from "react";
import {Focus, LoaderCircle, Video} from "lucide-react";
import type {RobotRealtimeState} from "@/lib/robot-realtime";
import {TRASH_TYPES, countObjects, parseObjects, type TrashObject, type VisionFrame} from "@/lib/trash-vision";

export function robotRecognition(robot: RobotRealtimeState | null): TrashObject[] | null {
  const auto = robot?.auto;
  if (!robot?.connected || !robot.fresh || !auto || auto.target_fresh === false ||
      !auto.label?.trim() || !TRASH_TYPES.some(t => t.bin === auto.bin)) return null;
  // The robot's BIN is its current locked target. Old candidates retained in AUTO state
  // are not necessarily from the latest image, so never count them as a fresh scene.
  return [{label: auto.label.trim(), bin: auto.bin!}];
}

export default function VisionPanel({robot, videoRef, trackOnline, frame, onFrame}: {
  robot: RobotRealtimeState | null; videoRef: React.RefObject<HTMLVideoElement | null>;
  trackOnline: boolean; frame: VisionFrame | null; onFrame: (frame: VisionFrame | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const robotObjects = robotRecognition(robot);
  const objects = frame?.objects ?? robotObjects;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  const counts = objects === null ? null : countObjects(objects);
  const autoActive = Boolean(robot?.fresh && robot?.connected && (robot?.auto?.auto_running || robot?.auto_running));
  const autoActiveRef = useRef(autoActive); autoActiveRef.current = autoActive;

  const capture = async () => {
    const video = videoRef.current;
    if (busyRef.current || !trackOnline || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight || autoActive) return;
    busyRef.current = true; setBusy(true); setError("");
    const abort = new AbortController(); controller.current = abort;
    try {
      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Trình duyệt không chụp được khung ảnh");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const capturedAt = Date.now();
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Không chụp được ảnh")), "image/jpeg", .85));
      const form = new FormData(); form.append("image", blob, "frame.jpg");
      form.append("width", String(canvas.width)); form.append("height", String(canvas.height));
      const response = await fetch("/api/vision/detect", {method: "POST", body: form, signal: abort.signal});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chưa nhận diện được ảnh");
      const detected = parseObjects(data.objects, {width: canvas.width, height: canvas.height});
      if (mounted.current && !abort.signal.aborted && !autoActiveRef.current)
        onFrame({url: canvas.toDataURL("image/jpeg", .85), width: canvas.width, height: canvas.height, objects: detected, capturedAt});
    } catch (cause) {
      if (mounted.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Nhận diện thất bại");
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <section className="recognition-panel" aria-label="Nhận diện rác">
    <div className="recognition-heading">
      <div><h2><Focus size={15}/>Nhận diện rác</h2><p>{frame ? `Khung ảnh lúc ${new Date(frame.capturedAt).toLocaleTimeString("vi-VN")}` : "Kết quả từ robot"}</p></div>
      <div className="recognition-actions">
        {frame && <button type="button" onClick={() => onFrame(null)} title="Trở lại camera trực tiếp"><Video size={14}/><span>Trực tiếp</span></button>}
        <button type="button" disabled={!trackOnline || busy || autoActive} onClick={() => void capture()}
          title={autoActive ? "AUTO đang nhận diện từ camera robot" : "Chụp và nhận diện một khung ảnh camera"}>
          {busy ? <LoaderCircle size={14} className="animate-spin"/> : <Focus size={14}/>}<span>{busy ? "Đang phân tích…" : "Phân tích ảnh"}</span>
        </button>
      </div>
    </div>
    <div className="recognition-objects" aria-live="polite">{objects === null ? "Chưa có kết quả nhận diện mới" : objects.length === 0 ? "Không thấy rác trong khung ảnh" : objects.map((object, i) => <span key={i}>
      <i style={{background: TRASH_TYPES.find(t => t.bin === object.bin)?.color}}/>{object.label}<small>{TRASH_TYPES.find(t => t.bin === object.bin)?.title}</small>
    </span>)}</div>
    <div className="recognition-counts">{TRASH_TYPES.map(t => <div key={t.field}><i style={{background: t.color}}/><span>{t.title}</span><strong>{counts ? counts[t.field] : "—"}</strong></div>)}</div>
    <div className="recognition-sync" data-state={error ? "error" : "waiting"} role="status"><span>{error}</span><small>Số vật trong kết quả mới nhất</small></div>
  </section>;
}

export function FrameOverlay({frame}: {frame: VisionFrame}) {
  return <div className="recognition-frame" aria-label="Khung ảnh đã phân tích">
    <svg viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label="Ảnh camera và khung nhận diện rác" preserveAspectRatio="xMidYMid meet">
      <image href={frame.url} width={frame.width} height={frame.height}/>
      {frame.objects.map((object, i) => {
        if (!object.bbox) return null;
        const [x1, y1, x2, y2] = object.bbox;
        const category = TRASH_TYPES.find(t => t.bin === object.bin)!;
        const fontSize = Math.max(13, frame.width / 55);
        return <g key={i}>
          <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill="none" stroke={category.color} strokeWidth={Math.max(2, frame.width / 400)}/>
          <text x={Math.min(x1 + 5, frame.width - 10)} y={Math.max(fontSize + 5, y1 - 7)} fill={category.color} stroke="#071510" strokeWidth={3} paintOrder="stroke" fontSize={fontSize} fontWeight={700}>{object.label} · {category.title}</text>
        </g>;
      })}
    </svg>
    <span className="recognition-frame-badge">ẢNH ĐÃ PHÂN TÍCH</span>
  </div>;
}
