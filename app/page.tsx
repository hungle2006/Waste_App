"use client";
import {useCallback, useEffect, useRef, useState} from "react";
import {Room, RoomEvent, Track, type RemoteTrack, type RemoteTrackPublication} from "livekit-client";
import type {RobotRealtimeState} from "@/lib/robot-realtime";
import MechanicalControl from "@/app/components/MechanicalControl";
import {Bot, Camera, CircleStop, Maximize, RotateCcw, Wifi, WifiOff} from "lucide-react";

type Mode = "manual" | "auto";
const ROBOT_ID = process.env.NEXT_PUBLIC_ROBOT_ID?.trim() || "robot_01";
const CAMERA_TRACK_NAME = process.env.NEXT_PUBLIC_CAMERA_TRACK_NAME?.trim() || "front_camera";

function Cam({videoRef, connected, trackOnline, onReconnect}: {
  videoRef: React.RefObject<HTMLVideoElement | null>; connected: boolean | null;
  trackOnline: boolean; onReconnect: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [fullscreenError, setFullscreenError] = useState("");
  const toggleFullscreen = async () => {
    try {
      setFullscreenError("");
      if (document.fullscreenElement === panelRef.current) await document.exitFullscreen();
      else if (panelRef.current?.requestFullscreen) await panelRef.current.requestFullscreen();
      else setFullscreenError("Trình duyệt chưa hỗ trợ toàn màn hình.");
    } catch {setFullscreenError("Trình duyệt chưa hỗ trợ toàn màn hình.");}
  };
  return <div ref={panelRef} className="camera-panel">
    <div className="camera-heading">
      <div className="flex min-w-0 items-center gap-2"><Camera size={17} className="text-emerald-400"/><h2 className="text-xs font-semibold">Camera robot</h2></div>
      <div className="flex items-center gap-2"><span role="status" className={`text-[10px] font-bold ${trackOnline ? "text-emerald-400" : "text-slate-400"}`}>{trackOnline ? "● TRỰC TIẾP" : connected === false ? "○ MẤT KẾT NỐI" : "○ ĐANG CHỜ"}</span><button type="button" onClick={toggleFullscreen} aria-label="Bật hoặc tắt toàn màn hình camera" title="Toàn màn hình camera" className="camera-icon-button"><Maximize size={15}/></button></div>
    </div>
    <div className="camera-viewport camera-grid">
      <video ref={videoRef} autoPlay playsInline muted aria-label="Hình ảnh trực tiếp từ camera robot" className="h-full w-full object-contain"/>
      {!trackOnline && <div className="camera-placeholder"><Camera size={30}/><p className="mt-2 text-xs font-medium text-slate-300">{connected === false ? "Chưa kết nối được camera" : "Đang chờ hình ảnh từ robot"}</p><button type="button" onClick={onReconnect} className="mt-3 flex min-h-9 items-center gap-2 rounded-lg border border-slate-600 px-3 text-[11px] text-slate-300 hover:bg-slate-800"><RotateCcw size={13}/>Kết nối lại camera</button></div>}
    </div>
    {fullscreenError && <p role="status" className="px-3 py-2 text-xs text-slate-400">{fullscreenError}</p>}
  </div>;
}

export default function Page() {
  const [mode, setMode] = useState<Mode>("manual");
  const [robot, setRobot] = useState<RobotRealtimeState | null>(null);
  const [bin, setBin] = useState<number | null>(null);
  const [last, setLast] = useState("Chưa gửi lệnh");
  const mechanicalStopRef = useRef<(() => void) | null>(null);
  const onRobotState = useCallback((next: RobotRealtimeState) => {setRobot(next);}, []);
  const registerMechanicalStop = useCallback((fn: (() => void) | null) => {mechanicalStopRef.current = fn;}, []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [livekitConnected, setLivekitConnected] = useState<boolean | null>(null);
  const [trackOnline, setTrackOnline] = useState(false);
  const [cameraSession, setCameraSession] = useState(0);
 useEffect(()=>{
  let cancelled=false;
  const room=new Room({adaptiveStream:true,dynacast:true});
  const subscribe=(publication:RemoteTrackPublication)=>{
   if(publication.kind===Track.Kind.Video&&publication.trackName===CAMERA_TRACK_NAME)publication.setSubscribed(true);
  };
  const attach=(track:RemoteTrack,publication:RemoteTrackPublication)=>{
   if(cancelled||track.kind!==Track.Kind.Video||publication.trackName!==CAMERA_TRACK_NAME)return;
   if(videoRef.current){track.attach(videoRef.current);setTrackOnline(true);}
  };
  const detach=(track:RemoteTrack,publication:RemoteTrackPublication)=>{
   if(publication.trackName!==CAMERA_TRACK_NAME)return;
   track.detach();
   if(!cancelled)setTrackOnline(false);
  };
  room.on(RoomEvent.TrackPublished,subscribe);
  room.on(RoomEvent.TrackSubscribed,attach);
  room.on(RoomEvent.TrackUnsubscribed,detach);
  room.on(RoomEvent.Reconnecting,()=>{if(!cancelled){setLivekitConnected(null);setTrackOnline(false);}});
  room.on(RoomEvent.Reconnected,()=>{if(!cancelled){setLivekitConnected(true);room.remoteParticipants.forEach(participant=>participant.videoTrackPublications.forEach(publication=>{subscribe(publication);if(publication.track)attach(publication.track,publication);}));}});
  room.on(RoomEvent.Disconnected,()=>{if(!cancelled){setLivekitConnected(false);setTrackOnline(false);}});
  setLivekitConnected(null);
  setTrackOnline(false);
  (async()=>{
   try{
    const res=await fetch("/api/livekit-token",{cache:"no-store"});
    if(!res.ok)throw new Error("token");
    const data=await res.json();
    if(cancelled)return;
    await room.connect(data.url,data.token,{autoSubscribe:false});
    if(cancelled){await room.disconnect();return;}
    setLivekitConnected(true);
    room.remoteParticipants.forEach(participant=>participant.videoTrackPublications.forEach(subscribe));
   }catch{if(!cancelled)setLivekitConnected(false);}
  })();
  return()=>{cancelled=true;void room.disconnect();};
 },[cameraSession]);

  const fresh = Boolean(robot?.connected && robot.fresh);
  const target = fresh ? robot?.auto?.label : null;
  const distanceReady = fresh && robot?.auto?.distance_ready;
  const tof = fresh && robot?.hardware.tof?.valid && (robot.hardware.tof.age_ms ?? Infinity) < 1500 ? robot.hardware.tof.mm : null;
  const distance = fresh ? robot?.auto?.tof_mm ?? tof : null;
  const ir = fresh ? robot?.hardware.sensors?.D19 : undefined;
  const stop = () => {mechanicalStopRef.current?.();};
  return <main className="operator-shell">
    <header className="operator-header">
      <div className="flex min-w-0 items-center gap-2.5"><div className="brand-mark"><Bot size={23}/></div><div className="min-w-0"><h1 className="text-sm font-bold sm:text-base">Waste Robot</h1><p className="hidden text-[11px] text-slate-500 sm:block">Quan sát và điều khiển · {ROBOT_ID}</p></div></div>
      <div role="group" aria-label="Chế độ vận hành" className="mode-switch"><button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>MANUAL</button><button type="button" aria-pressed={mode === "auto"} onClick={() => setMode("auto")}>AUTO</button></div>
      <div className="flex items-center gap-2"><span className={`header-connection ${fresh ? "text-emerald-700" : "text-slate-500"}`} title={fresh ? "Python đang gửi trạng thái mới" : "Chưa nhận trạng thái robot mới"}>{fresh ? <Wifi size={15}/> : <WifiOff size={15}/>}<span>{fresh ? "Robot online" : "Chờ robot"}</span></span><button type="button" onClick={stop} className="emergency-button"><CircleStop size={18}/><span>DỪNG KHẨN</span></button></div>
    </header>
    <div className="operator-workspace">
      <section className="vision-column" aria-label="Camera và trạng thái robot">
        <Cam videoRef={videoRef} connected={livekitConnected} trackOnline={trackOnline} onReconnect={() => setCameraSession(session => session + 1)}/>
        <div className="vision-telemetry">
          <div><span className="telemetry-label">Mục tiêu</span><strong className="truncate">{target || "Chưa xác nhận"}</strong></div>
          <div><span className="telemetry-label">Khoảng cách</span><strong className={distanceReady ? "text-emerald-700" : ""}>{distance != null ? `${(distance / 10).toFixed(1)} cm` : "—"}{distanceReady ? " ✓" : ""}</strong></div>
          <div><span className="telemetry-label">Kẹp · D19</span><strong>{ir === 0 ? "Có vật" : ir === 1 ? "Chưa có vật" : "—"}</strong></div>
          <div><span className="telemetry-label">Ngăn thùng</span><strong>{fresh && bin ? `BIN ${bin}` : "—"}</strong></div>
        </div>
        <div className="vision-summary" role="status"><span className={`h-2 w-2 shrink-0 rounded-full ${fresh ? "bg-emerald-500" : "bg-slate-300"}`}/><span className="min-w-0 flex-1 truncate">{fresh ? robot?.auto?.message || robot?.job || "Đang nhận trạng thái robot" : "Chạy Python trên máy robot rồi chọn Kết nối Python."}</span><span className="hidden max-w-[40%] truncate font-mono text-[10px] text-slate-400 xl:block" title={last}>{last}</span></div>
      </section>
      <MechanicalControl active autoMode={mode === "auto"} onRobotState={onRobotState} registerStop={registerMechanicalStop} onBinChange={setBin} onCommand={setLast}/>
    </div>
  </main>;
}
