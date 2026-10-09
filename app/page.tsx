"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Room, RoomEvent, Track, type RemoteTrack, type RemoteTrackPublication } from "livekit-client";
import { makeSupabase } from "@/lib/supabase";
import { ArrowUp,ArrowDown,ArrowLeft,ArrowRight,Bot,Camera,Maximize,CircleStop,Grab,Home,Leaf,PackageOpen,Play,Recycle,RotateCcw,ShieldAlert,Sparkles,Square,Trash2,Wifi,WifiOff } from "lucide-react";

type Mode="manual"|"auto";
type Status={state?:string;label?:string;category?:string;bin?:number;battery?:number;message?:string;center?:number[]};
const ROBOT_ID=process.env.NEXT_PUBLIC_ROBOT_ID||"robot_01";
const CAMERA_TRACK_NAME=process.env.NEXT_PUBLIC_CAMERA_TRACK_NAME||"front_camera";

const bins=[
{id:1,title:"Tái chế",sub:"Chai nhựa · lon kim loại",Icon:Recycle,tone:"emerald"},
{id:2,title:"Hữu cơ",sub:"Vỏ trái cây · thức ăn",Icon:Leaf,tone:"lime"},
{id:3,title:"Nguy hiểm",sub:"Pin · mảnh thủy tinh",Icon:ShieldAlert,tone:"amber"},
{id:4,title:"Rác khác",sub:"Nhóm còn lại",Icon:Trash2,tone:"slate"},
];

function Cam({videoRef,status,connected,trackOnline,onReconnect}:{videoRef:React.RefObject<HTMLVideoElement|null>;status:Status;connected:boolean|null;trackOnline:boolean;onReconnect:()=>void}){
 const panelRef=useRef<HTMLDivElement|null>(null);
 const [fullscreenError,setFullscreenError]=useState("");
 const toggleFullscreen=async()=>{
  try{
   setFullscreenError("");
   if(document.fullscreenElement===panelRef.current)await document.exitFullscreen();
   else await panelRef.current?.requestFullscreen();
  }catch{setFullscreenError("Trình duyệt chưa hỗ trợ toàn màn hình.")}
 };
 return <div ref={panelRef} className="camera-panel min-w-0 self-start overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-soft">
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
   <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white"><Camera size={18}/></div><div><h2 className="font-semibold">Camera robot</h2><div className="text-xs text-slate-500">Điều hướng · nhận diện · căn mục tiêu</div></div></div>
   <div className="flex items-center gap-2"><div role="status" className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${trackOnline?"bg-emerald-50 text-emerald-700":connected===false?"bg-red-50 text-red-600":"bg-slate-100 text-slate-500"}`}>{trackOnline?"● LIVE":connected===false?"● MẤT KẾT NỐI":"● ĐANG CHỜ"}</div><button type="button" onClick={toggleFullscreen} aria-label="Bật hoặc tắt toàn màn hình camera" title="Toàn màn hình" className="btn flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50"><Maximize size={16}/></button></div>
  </div>
  <div className="camera-viewport camera-grid relative aspect-video bg-[#101722]">
   <video ref={videoRef} autoPlay playsInline muted aria-label="Hình ảnh trực tiếp từ camera robot" className="h-full w-full object-contain"/>
   {!trackOnline&&<div className="absolute inset-0 flex flex-col items-center justify-center bg-[#101722] px-4 text-center text-slate-400"><Camera size={34}/><div className="mt-3 text-sm font-medium text-slate-300">{connected===false?"Không kết nối được camera":"Đang chờ camera từ Jetson"}</div><div className="mt-1 text-xs text-slate-500">{connected===true?"LiveKit đã kết nối · chờ hình ảnh":"Đang kết nối luồng trực tiếp"}</div><button type="button" onClick={onReconnect} className="btn mt-4 flex items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"><RotateCcw size={14}/>Kết nối lại</button></div>}
   {status.label&&trackOnline&&<div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl bg-slate-950/80 px-3 py-2 text-xs font-semibold text-white"><Sparkles size={14} className="text-emerald-400"/>{status.label}{status.bin?` · BIN ${status.bin}`:""}</div>}
  </div>
  {fullscreenError&&<p role="status" className="px-4 py-2 text-xs text-slate-500">{fullscreenError}</p>}
 </div>
}

export default function Page(){
 const supabase=useMemo(()=>makeSupabase(),[]); const channelRef=useRef<RealtimeChannel|null>(null); const moveTimerRef=useRef<ReturnType<typeof setInterval>|null>(null); const activeMoveRef=useRef<string|null>(null);
 const [mode,setMode]=useState<Mode>("manual"); const [online,setOnline]=useState<boolean|null>(null); const [status,setStatus]=useState<Status>({state:"ready",battery:92,message:"Sẵn sàng"}); const [bin,setBin]=useState<number|null>(null); const [busy,setBusy]=useState(false); const [last,setLast]=useState("-");
 const videoRef=useRef<HTMLVideoElement|null>(null);
 const [livekitConnected,setLivekitConnected]=useState<boolean|null>(null);
 const [trackOnline,setTrackOnline]=useState(false);
 const [cameraSession,setCameraSession]=useState(0);
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
 useEffect(()=>{ if(!supabase){setOnline(null);return;} const ch=supabase.channel(`robot:${ROBOT_ID}`); ch.on("broadcast",{event:"status"},({payload})=>{setStatus(s=>({...s,...payload}));if(typeof payload?.bin==="number")setBin(payload.bin)}).subscribe(s=>setOnline(s==="SUBSCRIBED"?true:s==="CHANNEL_ERROR"||s==="TIMED_OUT"?false:null)); channelRef.current=ch; return()=>{supabase.removeChannel(ch);channelRef.current=null};},[supabase]);
 const send=useCallback(async(type:string,action:string,value?:string|number)=>{setLast(`${type}:${action}`); if(channelRef.current){await channelRef.current.send({type:"broadcast",event:"command",payload:{robot_id:ROBOT_ID,type,action,value,ts:Date.now()}})}else{setStatus(s=>({...s,state:action,message:`DEMO · ${action}`}))}},[]);

 const stopMove=useCallback(()=>{activeMoveRef.current=null;if(moveTimerRef.current){clearInterval(moveTimerRef.current);moveTimerRef.current=null;}void send("move","stop");},[send]);
 const startMove=useCallback((action:string)=>{if(activeMoveRef.current===action)return;if(moveTimerRef.current){clearInterval(moveTimerRef.current);moveTimerRef.current=null;}activeMoveRef.current=action;void send("move",action);moveTimerRef.current=setInterval(()=>{if(activeMoveRef.current===action)void send("move",action);},250);},[send]);
 useEffect(()=>{const onBlur=()=>stopMove();window.addEventListener("blur",onBlur);return()=>{window.removeEventListener("blur",onBlur);if(moveTimerRef.current)clearInterval(moveTimerRef.current);};},[stopMove]);
 const detect=()=>{setBusy(true);send("ai","detect");if(!channelRef.current)setTimeout(()=>{setStatus(s=>({...s,state:"detected",label:"battery",category:"hazardous",bin:3,center:[86,164],message:"Đã phát hiện battery"}));setBin(3);setBusy(false)},800);else setTimeout(()=>setBusy(false),900)};
 const auto=()=>{setMode("auto");setBusy(true);send("mode","auto_start");if(!channelRef.current){const steps=["Đang quét khu vực...","Đang gửi frame tới AI...","Đã phát hiện battery","Đang căn tâm...","Đang gắp...","Đang xoay BIN 3...","Đã thả rác"];steps.forEach((m,i)=>setTimeout(()=>{setStatus(s=>({...s,message:m,state:"auto"+(i+1),...(i===2?{label:"battery",category:"hazardous",bin:3}:{})}));if(i>=2)setBin(3);if(i===steps.length-1)setBusy(false)},i*850))}};
 const stop=()=>{activeMoveRef.current=null;if(moveTimerRef.current){clearInterval(moveTimerRef.current);moveTimerRef.current=null;}setBusy(false);setMode("manual");setStatus(s=>({...s,state:"emergency_stop",message:"EMERGENCY STOP"}));send("system","emergency_stop")};
 return <main className="min-h-screen px-3 py-3 sm:px-5 sm:py-5 lg:px-7"><div className="mx-auto max-w-[1500px]">
  <header className="glass mb-5 flex flex-col gap-4 rounded-[28px] px-4 py-4 shadow-soft sm:px-6 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-3"><div className="relative flex h-12 w-12 items-center justify-center rounded-[18px] bg-slate-950 text-white"><Bot size={25}/><span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500"/></div><div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold">Waste Robot</h1><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold tracking-wider text-slate-500">CONTROL OS</span></div><p className="text-sm text-slate-500">Robot phân loại rác thông minh · {ROBOT_ID}</p></div></div><div className="flex flex-wrap gap-2"><div className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${online===true?"border-emerald-200 bg-emerald-50 text-emerald-700":online===false?"border-red-200 bg-red-50 text-red-700":"border-blue-200 bg-blue-50 text-blue-700"}`}>{online===false?<WifiOff size={14}/>:<Wifi size={14}/>} {online===true?"Realtime online":online===false?"Mất kết nối":"Demo mode"}</div><button onClick={stop} className="btn flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white"><CircleStop size={16}/> EMERGENCY STOP</button></div></header>
  <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Robot",status.state||"ready",status.message||"Sẵn sàng"],["AI Target",status.label||"Chưa phát hiện",status.category?`${status.category} · BIN ${status.bin}`:"LocateAnything-3B"],["Battery",`${status.battery??92}%`,"Jetson Nano"],["Current BIN",bin?`BIN ${bin}`:"HOME",last]].map(([a,b,c])=><div key={a} className="rounded-[22px] border border-slate-200 bg-white p-4"><div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">{a}</div><div className="mt-1 text-lg font-semibold">{b}</div><div className="mt-1 text-xs text-slate-500">{c}</div></div>)}</section>
  <section className="mb-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_330px]"><Cam videoRef={videoRef} status={status} connected={livekitConnected} trackOnline={trackOnline} onReconnect={()=>setCameraSession(session=>session+1)}/><aside className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-soft"><div className="text-sm font-bold">Chế độ vận hành</div><div className="mt-3 grid grid-cols-2 rounded-2xl bg-slate-100 p-1"><button onClick={()=>setMode("manual")} className={`min-h-10 rounded-xl text-xs font-bold ${mode==="manual"?"bg-white shadow-sm":"text-slate-500"}`}>MANUAL</button><button onClick={()=>setMode("auto")} className={`min-h-10 rounded-xl text-xs font-bold ${mode==="auto"?"bg-slate-950 text-white":"text-slate-500"}`}>AUTO</button></div>{mode==="manual"?<><div className="mt-5 text-xs font-bold tracking-wider text-slate-400">DI CHUYỂN</div><div className="mx-auto mt-3 grid max-w-[210px] grid-cols-3 gap-2"><div/><button onPointerDown={(e)=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);startMove("forward")}} onPointerUp={stopMove} onPointerCancel={stopMove} onPointerLeave={stopMove} onContextMenu={(e)=>e.preventDefault()} className="btn flex aspect-square touch-none items-center justify-center rounded-2xl border bg-slate-50"><ArrowUp/></button><div/><button onPointerDown={(e)=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);startMove("left")}} onPointerUp={stopMove} onPointerCancel={stopMove} onPointerLeave={stopMove} onContextMenu={(e)=>e.preventDefault()} className="btn flex aspect-square touch-none items-center justify-center rounded-2xl border bg-slate-50"><ArrowLeft/></button><button onClick={stopMove} className="btn flex aspect-square items-center justify-center rounded-2xl bg-slate-950 text-white"><Square fill="currentColor" size={18}/></button><button onPointerDown={(e)=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);startMove("right")}} onPointerUp={stopMove} onPointerCancel={stopMove} onPointerLeave={stopMove} onContextMenu={(e)=>e.preventDefault()} className="btn flex aspect-square touch-none items-center justify-center rounded-2xl border bg-slate-50"><ArrowRight/></button><div/><button onPointerDown={(e)=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);startMove("backward")}} onPointerUp={stopMove} onPointerCancel={stopMove} onPointerLeave={stopMove} onContextMenu={(e)=>e.preventDefault()} className="btn flex aspect-square touch-none items-center justify-center rounded-2xl border bg-slate-50"><ArrowDown/></button><div/></div><div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>send("arm","grab")} className="btn flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-bold text-white"><Grab size={18}/>GẮP</button><button onClick={()=>send("arm","release")} className="btn flex min-h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-bold"><PackageOpen size={18}/>THẢ</button><button onClick={()=>send("arm","home")} className="btn flex min-h-11 items-center justify-center gap-2 rounded-2xl border bg-slate-50 text-xs font-bold"><Home size={16}/>ARM HOME</button><button onClick={detect} disabled={busy} className="btn flex min-h-11 items-center justify-center gap-2 rounded-2xl border bg-slate-50 text-xs font-bold disabled:opacity-50"><Sparkles size={16}/>DETECT</button></div></>:<div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white"><div className="text-xs font-bold tracking-wider text-slate-400">AUTONOMOUS CYCLE</div><div className="mt-2 text-sm font-semibold">{status.message}</div><button onClick={auto} disabled={busy} className="btn mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-slate-950 disabled:opacity-60"><Play size={16} fill="currentColor"/>{busy?"ĐANG CHẠY":"START AUTO"}</button></div>}</aside></section>
  <section className="mb-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-soft"><div className="mb-4 flex items-end justify-between"><div><h2 className="text-lg font-bold">Cụm thùng phân loại</h2><p className="text-sm text-slate-500">Chọn thủ công hoặc nhận BIN từ AI.</p></div><div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold">{bin?`BIN ${bin}`:"HOME"}</div></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{bins.map(b=>{const I=b.Icon,active=bin===b.id;return <button key={b.id} onClick={()=>{setBin(b.id);send("bin","rotate",b.id)}} className={`btn rounded-[22px] border p-4 text-left ${active?"border-slate-950 bg-slate-950 text-white":"border-slate-200 bg-white hover:bg-slate-50"}`}><div className="flex items-start justify-between"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${active?"bg-white/10":"bg-slate-100"}`}><I size={20}/></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${active?"bg-white/10":"bg-slate-100 text-slate-500"}`}>BIN {b.id}</span></div><div className="mt-4 font-bold">{b.title}</div><div className={`mt-1 text-xs ${active?"text-slate-300":"text-slate-500"}`}>{b.sub}</div></button>})}</div><div className="mt-3 flex justify-end"><button onClick={()=>{setBin(null);send("bin","home")}} className="btn flex min-h-10 items-center gap-2 rounded-xl border bg-slate-50 px-4 text-xs font-bold"><RotateCcw size={15}/>BIN HOME</button></div></section>
  <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]"><div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-soft"><div className="font-bold">AI Detection</div><div className="mt-4 grid gap-3 sm:grid-cols-4">{[["Object",status.label||"—"],["Category",status.category||"—"],["Center",status.center?`[${status.center.join(", ")}]`:"—"],["Target",status.bin?`BIN ${status.bin}`:"—"]].map(([a,b])=><div key={a} className="rounded-2xl bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{a}</div><div className="mt-1 font-semibold">{b}</div></div>)}</div></div><div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-soft"><div className="font-bold">Realtime console</div><div className="mt-4 space-y-1 rounded-2xl bg-slate-950 p-4 font-mono text-[11px] text-slate-300"><div><span className="text-slate-500">channel</span> robot:{ROBOT_ID}</div><div><span className="text-slate-500">status</span> {online===true?"online":online===false?"offline":"demo"}</div><div><span className="text-slate-500">command</span> {last}</div><div><span className="text-slate-500">robot</span> {status.state}</div></div></div></section>
  <footer className="py-7 text-center text-xs text-slate-400">Waste Robot Control · Vercel + Supabase Realtime + Jetson Nano + Modal AI</footer>
 </div></main>
}
