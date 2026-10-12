"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RobotRealtimeClient } from "@/lib/robot-realtime";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, CircleStop,
  Cpu, Grip, Leaf, Link2, PackageOpen, Radio, Recycle, RotateCcw,
  Save, Settings2, ShieldAlert, SlidersHorizontal, Square, Trash2 } from "lucide-react";

type Joint = "p1" | "p10" | "p11";
type Pose = "SETUP" | "SEARCH" | "PLACE" | "REAR";
type Config = {
  limits: Record<string, [number, number]>;
  poses: Record<Pose, Record<string, number>>;
  grip: { open: number; close: number };
  bins: Record<string, number>;
};
type RobotState = {
  connected: boolean; fresh: boolean; stopped: boolean; busy: boolean;
  simulation: boolean; epoch: number; job: string; progress: number; auto_rear: boolean;
  hardware: { pca?: boolean; joints?: Record<string, number | null>; motors?: number[]; sensors?: Record<string, number> };
  config: Config; log: { time: string; text: string }[];
};
type Payload = { command: string; speed?: number } | { joint: Joint; pulse_us: number } | { name: Pose; values: Record<Joint, number> };
type Props = { active: boolean; registerStop: (fn: (() => void) | null) => void;
  onBinChange: (bin: number | null) => void; onCommand: (message: string) => void };

const JOINTS: { id: Joint; name: string; sub: string; value: number }[] = [
  { id: "p1", name: "Khớp cánh tay S2", sub: "Co / duỗi cánh tay", value: 1300 },
  { id: "p10", name: "Khớp cánh tay S1", sub: "Nâng / hạ cánh tay", value: 950 },
  { id: "p11", name: "Trụ xoay cánh tay", sub: "Xoay trái / phải", value: 1250 },
];
const POSES: { id: Pose; title: string; sub: string; command: string }[] = [
  { id: "SETUP", title: "Thiết lập tất cả", sub: "Khởi tạo 7 servo", command: "SETUP ALL" },
  { id: "SEARCH", title: "Tìm rác phía trước", sub: "Tư thế mặc định · mở kẹp", command: "POSE SEARCH" },
  { id: "PLACE", title: "Đưa rác tới thùng", sub: "Giữ trạng thái kẹp", command: "POSE PLACE" },
  { id: "REAR", title: "Quan sát phía sau", sub: "Dừng bánh · chuyển tư thế", command: "POSE REAR" },
];
const BINS = [
  { key: "RECYCLE", id: 1, title: "Tái chế", pulse: 2350, Icon: Recycle, tone: "text-emerald-600 bg-emerald-50" },
  { key: "ORGANIC", id: 2, title: "Hữu cơ", pulse: 1000, Icon: Leaf, tone: "text-lime-600 bg-lime-50" },
  { key: "HAZARD", id: 3, title: "Nguy hiểm", pulse: 1450, Icon: ShieldAlert, tone: "text-amber-600 bg-amber-50" },
  { key: "OTHER", id: 4, title: "Rác khác", pulse: 1900, Icon: Trash2, tone: "text-slate-600 bg-slate-100" },
];
const INITIAL = Object.fromEntries(JOINTS.map(j => [j.id, j.value])) as Record<Joint, number>;
const DIRECTIONS = [
  ["FORWARD_LEFT", "Tiến chéo trái", "↖"], ["FORWARD", "Tiến thẳng", "↑"], ["FORWARD_RIGHT", "Tiến chéo phải", "↗"],
  ["LEFT", "Đi ngang trái", "←"], ["STOP", "Dừng bánh", "■"], ["RIGHT", "Đi ngang phải", "→"],
  ["BACK_LEFT", "Lùi chéo trái", "↙"], ["BACK", "Lùi thẳng", "↓"], ["BACK_RIGHT", "Lùi chéo phải", "↘"],
];
const TURNS = [["TURN_LEFT", "Quay tại chỗ trái", "↶"], ["TURN_RIGHT", "Quay tại chỗ phải", "↷"]];
const ARCS = [["ARC_FORWARD_LEFT", "Tiến cua trái"], ["ARC_FORWARD_RIGHT", "Tiến cua phải"],
  ["ARC_BACK_LEFT", "Lùi cua trái"], ["ARC_BACK_RIGHT", "Lùi cua phải"]];
const WHEELS = [["M1", "Trước phải", "−"], ["M2", "Sau trái", "−"], ["M3", "Sau phải", "−"], ["M4", "Trước trái", "+"]];
const button = "btn flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40";

export default function MechanicalControl({ active, registerStop, onBinChange, onCommand }: Props) {
  const [robot, setRobot] = useState<RobotState | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState<Record<Joint, number>>(INITIAL);
  const [pending, setPending] = useState(false);
  const [pose, setPose] = useState<Pose>("SEARCH");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [speed, setSpeed] = useState(20);
  const [driveHeld, setDriveHeld] = useState("");
  const driveRef = useRef<{ mode: string; epoch: number; speed: number } | null>(null);
  const driveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeRef = useRef<RobotRealtimeClient | null>(null);
  const [brokerOnline, setBrokerOnline] = useState(false);
  const robotRef = useRef<RobotState | null>(null);
  const draftRef = useRef<Record<Joint, number>>(INITIAL);
  const pendingRef = useRef(false);
  const pollingRef = useRef(false);
  const generationRef = useRef(0);
  const dirtyRef = useRef(new Set<Joint>());

  const applyState = useCallback((next: RobotState) => {
    robotRef.current = next;
    setRobot(next);
    if (!next.fresh || !next.connected) return;
    const values = { ...draftRef.current };
    for (const j of JOINTS) {
      const actual = next.hardware.joints?.[j.id];
      if (!dirtyRef.current.has(j.id) && actual != null) values[j.id] = actual;
    }
    draftRef.current = values;
    setDraft(values);
    const currentBin = BINS.find(b => next.hardware.joints?.p9 === next.config.bins[b.key]);
    if (next.hardware.joints?.p9 != null) onBinChange(currentBin?.id ?? null);
  }, [onBinChange]);

  const request = useCallback(async (path: string, payload?: unknown): Promise<RobotState> => {
    if (!realtimeRef.current) throw new Error("Kết nối Supabase chưa sẵn sàng");
    return await realtimeRef.current.request(path, payload) as RobotState;
  }, []);

  useEffect(() => {
    let alive = true;
    const realtime = new RobotRealtimeClient(next => {
      if (alive) applyState(next as RobotState);
    }, (online, hasConfig) => {
      if (alive) { setBrokerOnline(online); setConfigured(hasConfig); }
    });
    realtimeRef.current = realtime; realtime.start();
    return () => { alive = false; realtime.close(); realtimeRef.current = null; };
  }, [applyState]);

  const mutate = useCallback(async (payload: Payload, path = "command", urgent = false) => {
    if ("command" in payload && (payload.command === "STOP" || payload.command === "XM")) {
      driveRef.current = null;
      if (driveTimer.current) clearTimeout(driveTimer.current);
      setDriveHeld("");
    }
    if (!realtimeRef.current) { setMessage("Kết nối Supabase trước."); return false; }
    if (pendingRef.current && !urgent) return false;
    const generation = urgent ? ++generationRef.current : generationRef.current;
    pendingRef.current = true;
    setPending(true);
    try {
      const next = await request(path, { ...payload, epoch: robotRef.current?.epoch ?? 0 });
      if (generation !== generationRef.current) return false;
      applyState(next);
      setMessage("command" in payload ? payload.command === "STOP" ? "Đã dừng và hủy chuỗi tư thế." : "Python đã nhận thao tác." : path === "poses" ? "Đã lưu tư thế vào Python." : "Python đã nhận xung khớp.");
      onCommand("mechanics:" + ("command" in payload ? payload.command : "joint" in payload ? `${payload.joint}:${payload.pulse_us}` : `save:${payload.name}`));
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mất kết nối bộ điều khiển");
      return false;
    } finally {
      if (generation === generationRef.current) { pendingRef.current = false; setPending(false); }
    }
  }, [applyState, onCommand, request]);

  const releaseDrive = useCallback(() => {
    if (driveRef.current) void mutate({ command: "XM" }, "command", true);
  }, [mutate]);

  const startDrive = (mode: string) => {
    const current = robotRef.current;
    if (driveRef.current || pendingRef.current || !active || !connected || !current?.connected ||
        !current.fresh || current.stopped || current.busy || current.auto_rear) return;
    const session = { mode, epoch: current.epoch, speed };
    driveRef.current = session;
    setDriveHeld(mode);
    const generation = generationRef.current;
    const tick = async () => {
      if (driveRef.current !== session) return;
      try {
        const next = await request("command", { command: `DRIVE ${mode}`, speed: session.speed, epoch: session.epoch });
        if (driveRef.current !== session || generation !== generationRef.current) return;
        applyState(next);
        if (next.epoch !== session.epoch || next.stopped || !next.connected) { releaseDrive(); return; }
        setMessage(`Đang giữ nút · PWM ${session.speed}. Thả nút để dừng.`);
        driveTimer.current = setTimeout(() => void tick(), 180);
      } catch (error) {
        if (driveRef.current !== session) return;
        releaseDrive();
        setMessage(error instanceof Error ? error.message : "Không gửi được lệnh bánh xe");
      }
    };
    onCommand(`mechanics:DRIVE ${mode}`);
    void tick();
  };

  useEffect(() => {
    const hidden = () => { if (document.hidden) releaseDrive(); };
    window.addEventListener("blur", releaseDrive);
    window.addEventListener("pointerup", releaseDrive);
    window.addEventListener("pointercancel", releaseDrive);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", releaseDrive);
      window.removeEventListener("pointerup", releaseDrive);
      window.removeEventListener("pointercancel", releaseDrive);
      document.removeEventListener("visibilitychange", hidden);
      if (driveTimer.current) clearTimeout(driveTimer.current);
      if (driveRef.current) {
        driveRef.current = null;
        void request("command", { command: "XM", epoch: robotRef.current?.epoch ?? 0 }).catch(() => {});
      }
    };
  }, [releaseDrive, request]);

  useEffect(() => {
    registerStop(() => { void mutate({ command: "STOP" }, "command", true); });
    return () => registerStop(null);
  }, [mutate, registerStop]);

  const previousActive = useRef(active);
  useEffect(() => {
    if (previousActive.current && !active && robotRef.current?.connected && !robotRef.current.stopped) {
      void mutate({ command: "STOP" }, "command", true);
    }
    previousActive.current = active;
  }, [active, mutate]);

  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(async () => {
      if (pendingRef.current || pollingRef.current) return;
      pollingRef.current = true;
      const generation = generationRef.current;
      try {
        const next = await request("status");
        if (generation === generationRef.current) applyState(next);
      } catch {
        if (generation === generationRef.current && robotRef.current) {
          applyState({ ...robotRef.current, connected: false, fresh: false, hardware: {} });
          setMessage("Mất kết nối Python; trạng thái phần cứng chưa xác nhận.");
        }
      } finally { pollingRef.current = false; }
    }, 1000);
    return () => clearInterval(timer);
  }, [applyState, connected, request]);

  async function connect() {
    if (pendingRef.current) return;
    const generation = ++generationRef.current;
    pendingRef.current = true; setPending(true);
    try {
      const next = await request("connect", {});
      if (generation !== generationRef.current) return;
      dirtyRef.current.clear();
      draftRef.current = { ...INITIAL, ...next.config.poses.SETUP };
      setDraft({ ...draftRef.current });
      setConnected(true); applyState(next);
      setMessage(next.stopped ? "Đã kết nối. Cho phép điều khiển để robot về tư thế tìm rác phía trước." : "Đã kết nối. Python đang thiết lập tư thế tìm rác phía trước.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không kết nối được"); }
    finally { if (generation === generationRef.current) { pendingRef.current = false; setPending(false); } }
  }

  function editJoint(id: Joint, value: number) {
    const limits = robot?.config.limits[id] ?? [500, 2500];
    if (!Number.isInteger(value) || value < limits[0] || value > limits[1]) return;
    dirtyRef.current.add(id);
    draftRef.current = { ...draftRef.current, [id]: value };
    setDraft({ ...draftRef.current });
  }

  const ready = connected && robot?.connected && robot.fresh;
  const moving = Boolean(robot?.hardware.motors?.some(pwm => pwm !== 0));
  const canMove = Boolean(active && ready && !robot?.stopped && !robot?.busy && !pending && !moving && !driveHeld);
  const canDrive = Boolean(active && ready && !robot?.stopped && !robot?.busy && !pending && !robot?.auto_rear);
  const hardware = ready ? robot.hardware : {};
  const acknowledged = (id: string) => hardware.joints?.[id] == null ? "Chưa gửi" : `${hardware.joints[id]} µs`;
  const action = (command: string) => { void mutate({ command }); };
  const driveButton = (mode: string, title: string, symbol?: string) => <button key={mode} type="button"
    aria-label={title} aria-pressed={driveHeld === mode} disabled={!canDrive}
    onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); startDrive(mode); }}
    onPointerUp={releaseDrive} onPointerCancel={releaseDrive} onLostPointerCapture={releaseDrive}
    onKeyDown={e => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); startDrive(mode); } }}
    onKeyUp={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); releaseDrive(); } }} onBlur={releaseDrive}
    className={`btn flex min-h-[60px] touch-none select-none flex-col items-center justify-center gap-1 rounded-xl border px-1 text-center disabled:opacity-35 ${driveHeld === mode ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-slate-50 hover:border-emerald-300"}`}>
    {symbol && <span aria-hidden="true" className="text-2xl leading-none">{symbol}</span>}<span className="text-[10px] font-semibold">{title}</span>
  </button>;

  if (!active) return null;
  return <section id="mechanical-control" className="mb-5 overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-soft">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50 via-white to-blue-50 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white"><SlidersHorizontal size={21}/></div><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-emerald-700">Manual / Mechanical control</div><h2 className="text-xl font-bold">Điều khiển cơ khí</h2><p className="mt-0.5 text-xs text-slate-500">Cánh tay · càng kẹp · bánh xe · thùng rác</p></div></div>
      <div className="flex items-center gap-2">{robot?.simulation && <span className="rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-bold text-amber-800">MÔ PHỎNG</span>}<span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold ${ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-slate-400"}`}/>{ready ? "Arduino đã kết nối" : "Chưa kết nối Arduino"}</span></div>
    </div>
    <div className="px-5 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <Radio size={17} className="ml-1 text-emerald-600"/>
        <div className="min-w-0 flex-1"><div className="text-xs font-semibold">Supabase Realtime</div><div className="mt-0.5 text-[10px] text-slate-500">{brokerOnline ? "Đã kết nối kênh robot · lệnh và trạng thái" : "Đang kết nối kênh robot"}</div></div>
        <button disabled={pending || configured === false || !brokerOnline} onClick={() => void connect()} className={button}><Link2 size={14}/>Kết nối Python</button>
        <button disabled={!ready || !robot?.stopped || robot.busy || pending} onClick={() => action("RESUME")} className="btn flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><Check size={14}/>Cho phép điều khiển</button>
        <button onClick={() => void mutate({ command: "STOP" }, "command", true)} className="btn flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700"><CircleStop size={15}/>Dừng cơ khí</button>
      </div>
      <p role="status" className={`mt-2 min-h-5 text-xs ${configured === false ? "text-amber-700" : "text-slate-500"}`}>{configured === false ? "Thiếu cấu hình Supabase của app." : message || "Chạy bộ Python Realtime trên máy nối Arduino, rồi bấm Kết nối Python. Camera dùng LiveKit; AI dùng Modal."}</p>
    </div>
    <div className="grid gap-6 px-5 py-5 sm:px-6 xl:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-bold"><Settings2 size={16} className="text-emerald-600"/>Tư thế cánh tay</h3><button onClick={() => setEditing(v => !v)} aria-expanded={editing} className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><Save size={13}/>Lưu tư thế<ChevronDown size={13}/></button></div>
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700"><Check size={13}/>Mặc định: tìm rác phía trước</div>
        <div className="grid grid-cols-2 gap-2">{POSES.map(p => <button key={p.id} disabled={!canMove} onClick={() => action(p.command)} className={`${button} !block !justify-start !p-3 !text-left ${p.id === "SEARCH" ? "!border-emerald-200 !bg-emerald-50" : ""}`}><span className="font-bold">{p.title}</span><span className="mt-1 block text-[10px] font-normal text-slate-500">{p.sub}</span></button>)}</div>
        {editing && <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
          <p className="text-xs text-slate-600">Lưu các giá trị thanh kéo vào tư thế của Python. Lưu không làm tay chuyển động.</p>
          <div className="mt-3 flex flex-wrap gap-2"><select aria-label="Tư thế cần lưu" value={pose} onChange={e => setPose(e.target.value as Pose)} className="min-h-10 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-xs">{POSES.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
            <button className={button} disabled={!robot} onClick={() => {
              if (!robot) return;
              const values = { ...draftRef.current };
              for (const j of JOINTS) if (robot.config.poses[pose][j.id] != null) { values[j.id] = robot.config.poses[pose][j.id]; dirtyRef.current.add(j.id); }
              draftRef.current = values; setDraft(values); setMessage("Đã nạp tư thế vào thanh kéo; chưa gửi tới Arduino.");
            }}>Nạp giá trị</button><button disabled={!canMove} onClick={() => void mutate({ name: pose, values: draftRef.current }, "poses")} className={button}><Save size={13}/>Lưu</button>
          </div>
        </div>}
        <div className="mt-3 rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-2 text-[11px]"><span className="truncate text-slate-500">{ready ? robot.job : "Tư thế do Python thiết lập và lưu"}</span><span className="font-bold text-emerald-700">{robot?.busy ? `${robot.progress}%` : ready && robot.stopped ? "ĐANG KHÓA" : ""}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${robot?.progress ?? 0}%` }}/></div></div>
        <div className="mt-4 divide-y divide-slate-100">{JOINTS.map(j => {
          const [min, max] = robot?.config.limits[j.id] ?? [500, 2500];
          const submit = () => { if (canMove) void mutate({ joint: j.id, pulse_us: draftRef.current[j.id] }); };
          return <div key={j.id} className="py-4 first:pt-1">
            <div className="mb-2.5 flex items-center justify-between gap-3"><div className="flex items-center gap-2.5"><span className="flex h-9 min-w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-600">{j.id.toUpperCase()}</span><div><label htmlFor={`mechanical-${j.id}`} className="text-[13px] font-semibold">{j.name}</label><div className="text-[10px] text-slate-400">{j.sub}</div></div></div><div className="flex items-center gap-1.5"><input aria-label={`Xung ${j.name}`} type="number" min={min} max={max} step={1} value={draft[j.id]} onChange={e => editJoint(j.id, Number(e.target.value))} className="w-[76px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm font-bold text-emerald-700 outline-none focus:border-emerald-500"/><span className="text-[10px] text-slate-400">µs</span></div></div>
            <input id={`mechanical-${j.id}`} type="range" min={min} max={max} step={10} value={draft[j.id]} disabled={Boolean(robot?.busy || pending)} onChange={e => editJoint(j.id, Number(e.target.value))} onPointerUp={submit} onKeyUp={e => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) submit(); }} className="h-5 w-full cursor-pointer accent-emerald-600 disabled:opacity-50"/>
            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400"><span>{min} µs</span><span className="text-slate-500">Đã nhận: <span className="font-semibold">{acknowledged(j.id)}</span></span><button disabled={!canMove} onClick={submit} className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-emerald-700 disabled:opacity-35">Gửi</button><span>{max} µs</span></div>
          </div>;
        })}</div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">500–2500 µs là giới hạn phần mềm. Xung đã nhận không phải góc đo thực tế. Khớp nối và càng kẹp được điều khiển qua tư thế và nút riêng.</p>
      </div>
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Grip size={16} className="text-emerald-600"/>Càng kẹp</h3><div className="grid grid-cols-2 gap-2"><button disabled={!canMove} onClick={() => action("GRIP OPEN")} className="btn flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl bg-emerald-600 text-xs font-bold text-white disabled:opacity-40"><PackageOpen size={19}/>Mở càng kẹp<span className="text-[10px] font-normal opacity-70">{robot?.config.grip.open ?? 600} µs</span></button><button disabled={!canMove} onClick={() => action("GRIP CLOSE")} className={`${button} !min-h-[64px] !flex-col`}><Grip size={19}/>Đóng càng kẹp<span className="text-[10px] font-normal text-slate-400">{robot?.config.grip.close ?? 1400} µs</span></button></div></div>
        <div className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Trash2 size={16} className="text-emerald-600"/>Thùng phân loại</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">{BINS.map(b => {
          const pulse = robot?.config.bins[b.key] ?? b.pulse; const selected = hardware.joints?.p9 === pulse;
          return <button disabled={!canMove} key={b.key} onClick={() => action(`SORT ${b.key}`)} className={`btn rounded-xl border px-2 py-3 text-center disabled:opacity-40 ${selected ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}><span className={`mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${b.tone}`}><b.Icon size={17}/></span><span className="block text-xs font-semibold">{b.title}</span><span className="mt-1 block text-[10px] text-slate-400">BIN {b.id} · {pulse} µs</span></button>;
        })}</div><div className="mt-3 grid grid-cols-2 gap-2"><button disabled={!canMove} onClick={() => action("LID OPEN")} className={button}><PackageOpen size={15}/>Mở nắp</button><button disabled={!canMove} onClick={() => action("LID CLOSE")} className={button}><Square size={13}/>Đóng nắp</button></div><p className="mt-2 text-[10px] text-slate-400">Chọn ngăn chỉ xoay thùng. Nắp và kẹp thao tác riêng.</p></div>
        <div className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-bold"><Radio size={16} className="text-emerald-600"/>Cảm biến cơ khí</h3><span className="text-[10px] text-slate-400">LOW = phát hiện</span></div><div className="grid grid-cols-3 gap-2">{[["D15", "IR 01"], ["D16", "IR 02"], ["D18", "Phía sau"]].map(([pin, title]) => {
          const val = hardware.sensors?.[pin];
          return <div key={pin} className={`rounded-xl border px-2.5 py-3 ${val === 0 ? "border-emerald-200 bg-emerald-50" : "border-slate-100 bg-slate-50"}`}><div className="text-[10px] font-bold text-slate-400">{title} · {pin}</div><div className={`mt-2 text-[11px] font-semibold ${val === 0 ? "text-emerald-700" : "text-slate-600"}`}>{val === 0 ? "Có vật" : val === 1 ? "Không phát hiện" : "Chưa có dữ liệu"}</div></div>;
        })}</div><p className="mt-2 text-[10px] text-slate-400">IR thứ hai nối OUT vào D16, thay cho P15 trên PCA.</p></div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold">Di chuyển Mecanum</h3><p className="mt-1 text-[11px] text-slate-500">Giữ để chạy · thả để dừng</p></div><label className="flex items-center gap-2 text-[11px] text-slate-500">PWM<input aria-label="PWM bánh xe" type="number" min={1} max={255} value={speed} disabled={Boolean(driveHeld)} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 255) setSpeed(n); }} className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center font-bold text-emerald-700"/></label></div>
          <div className="grid grid-cols-3 gap-2">{DIRECTIONS.map(([mode, title, symbol]) => mode === "STOP" ? <button key={mode} aria-label={title} onClick={() => void mutate({ command: "XM" }, "command", true)} className="btn flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl bg-slate-950 text-white"><Square size={16} fill="currentColor"/><span className="text-[10px] font-semibold">Dừng bánh</span></button> : driveButton(mode, title, symbol))}</div>
          <div className="mt-2 grid grid-cols-2 gap-2">{TURNS.map(([mode, title, symbol]) => driveButton(mode, title, symbol))}</div>
          <div className="mt-3 border-t border-slate-100 pt-3"><p className="mb-2 text-[10px] font-semibold text-slate-500">Cua theo cung khi đang tiến / lùi</p><div className="grid grid-cols-2 gap-2">{ARCS.map(([mode, title]) => driveButton(mode, title))}</div></div>
          <div className="mt-3 grid grid-cols-2 gap-2">{WHEELS.map(([name, position, sign], i) => <div key={name} className="rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] text-slate-500"><b className="text-slate-700">{name}</b> · {position}<span className="float-right font-mono font-bold">{hardware.motors?.[i] ?? "—"}</span><span className="mt-1 block text-slate-400">Chiều tiến: PWM {sign}</span></div>)}</div>
          <p className="mt-3 text-[10px] leading-relaxed text-slate-400">Hướng tính theo robot, nhìn từ sau ra trước. Con lăn lắp hình X. Mặc định PWM 20; mất lệnh làm mới thì Arduino dừng bánh sau tối đa 500 ms.</p>
          {robot?.auto_rear && <p className="mt-2 text-xs text-amber-700">Tắt chế độ tự nhìn sau để di chuyển.</p>}
        </div>
        <div className="rounded-2xl bg-slate-950 p-4 text-white"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-xs font-semibold"><Cpu size={14} className="text-emerald-400"/>Nhật ký Python</h3><span className="text-[10px] text-slate-500">{hardware.pca === true ? "PCA đã khởi tạo" : ""}</span></div><div className="mt-3 max-h-[120px] space-y-2 overflow-auto text-[11px]">{robot?.log.length ? robot.log.slice(0, 8).map((entry, i) => <div key={`${entry.time}-${i}`} className="flex gap-3"><time className="shrink-0 font-mono text-slate-500">{entry.time}</time><span className="text-slate-300">{entry.text}</span></div>) : <p className="text-slate-500">Chưa có thao tác. Kết nối Python để nhận trạng thái thật.</p>}</div></div>
      </div>
    </div>
  </section>;
}
