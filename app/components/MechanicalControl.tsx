"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, CircleStop,
  Cpu, Grip, Leaf, Link2, LockKeyhole, PackageOpen, Radio, Recycle, RotateCcw,
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
type Payload = { command: string } | { joint: Joint; pulse_us: number } | { name: Pose; values: Record<Joint, number> };
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
const button = "btn flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40";

export default function MechanicalControl({ active, registerStop, onBinChange, onCommand }: Props) {
  const [accessKey, setAccessKey] = useState("");
  const [robot, setRobot] = useState<RobotState | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState<Record<Joint, number>>(INITIAL);
  const [pending, setPending] = useState(false);
  const [pose, setPose] = useState<Pose>("SEARCH");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const keyRef = useRef("");
  const robotRef = useRef<RobotState | null>(null);
  const draftRef = useRef<Record<Joint, number>>(INITIAL);
  const pendingRef = useRef(false);
  const pollingRef = useRef(false);
  const generationRef = useRef(0);
  const dirtyRef = useRef(new Set<Joint>());

  useEffect(() => {
    let alive = true;
    fetch("/api/robot/configuration", { cache: "no-store" }).then(r => r.json())
      .then(data => { if (alive) setConfigured(data.configured === true); })
      .catch(() => { if (alive) setConfigured(false); });
    return () => { alive = false; };
  }, []);

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
    const response = await fetch(`/api/robot/${path}`, {
      method: payload === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "x-robot-access-key": keyRef.current },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : data.error || "Không gửi được lệnh");
    return data as RobotState;
  }, []);

  const mutate = useCallback(async (payload: Payload, path = "command", urgent = false) => {
    if (!keyRef.current) { setMessage("Nhập khóa và kết nối bộ điều khiển trước."); return false; }
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
    if (!keyRef.current) { setMessage("Nhập khóa điều khiển trước."); return; }
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
  const canMove = Boolean(active && ready && !robot?.stopped && !robot?.busy && !pending && !moving);
  const hardware = ready ? robot.hardware : {};
  const acknowledged = (id: string) => hardware.joints?.[id] == null ? "Chưa gửi" : `${hardware.joints[id]} µs`;
  const action = (command: string) => { void mutate({ command }); };

  if (!active) return null;
  return <section id="mechanical-control" className="mb-5 overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-soft">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50 via-white to-blue-50 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white"><SlidersHorizontal size={21}/></div><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-emerald-700">Manual / Mechanical control</div><h2 className="text-xl font-bold">Điều khiển cơ khí</h2><p className="mt-0.5 text-xs text-slate-500">Cánh tay · càng kẹp · bánh xe · thùng rác</p></div></div>
      <div className="flex items-center gap-2">{robot?.simulation && <span className="rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-bold text-amber-800">MÔ PHỎNG</span>}<span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold ${ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-slate-400"}`}/>{ready ? "Arduino đã kết nối" : "Chưa kết nối Arduino"}</span></div>
    </div>
    <div className="px-5 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <LockKeyhole size={17} className="ml-1 text-slate-400"/>
        <input aria-label="Khóa điều khiển cơ khí" type="password" autoComplete="off" value={accessKey} placeholder="Khóa điều khiển Python" className="min-h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-emerald-500" onChange={e => {
          const key = e.target.value; keyRef.current = key; setAccessKey(key); setConnected(false);
          generationRef.current++; pendingRef.current = false; setPending(false);
          if (robotRef.current) applyState({ ...robotRef.current, connected: false, fresh: false, hardware: {} });
        }}/>
        <button disabled={pending || configured === false} onClick={() => void connect()} className={button}><Link2 size={14}/>Kết nối Python</button>
        <button disabled={!ready || !robot?.stopped || robot.busy || pending} onClick={() => action("RESUME")} className="btn flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><Check size={14}/>Cho phép điều khiển</button>
        <button onClick={() => void mutate({ command: "STOP" }, "command", true)} className="btn flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700"><CircleStop size={15}/>Dừng cơ khí</button>
      </div>
      <p role="status" className={`mt-2 min-h-5 text-xs ${configured === false ? "text-amber-700" : "text-slate-500"}`}>{configured === false ? "Bộ điều khiển Python chưa được kết nối với website. Bạn có thể xem và chỉnh giá trị; robot chưa nhận các thao tác này." : message || "Tư thế khởi tạo mặc định: tìm rác phía trước. Kết nối Python để thiết lập robot."}</p>
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
        <div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-4"><div><h3 className="text-sm font-bold">Di chuyển · 4 motor</h3><p className="mt-1 text-[10px] text-slate-400">Mỗi nhấn chạy 300 ms · PWM 80</p><div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-500">{[1, 2, 3, 4].map((m, i) => <span key={m}>M{m} <b className="ml-2">{hardware.motors?.[i] ?? "—"}</b></span>)}</div></div><div className="grid shrink-0 grid-cols-3 gap-1.5">{[["", ""], ["DRIVE FORWARD", "Tiến"], ["", ""], ["DRIVE LEFT", "Quay trái"], ["XM", "Dừng bánh"], ["DRIVE RIGHT", "Quay phải"], ["", ""], ["DRIVE BACK", "Lùi"]].map(([command, title], index) => command ? <button key={command} aria-label={title} disabled={command !== "XM" && !canMove} onClick={() => command === "XM" ? void mutate({ command }, "command", true) : action(command)} className={`btn flex h-10 w-10 items-center justify-center rounded-xl disabled:opacity-35 ${command === "XM" ? "bg-slate-950 text-white" : "border border-slate-200 bg-slate-50"}`}>{command === "DRIVE FORWARD" ? <ArrowUp size={17}/> : command === "DRIVE LEFT" ? <ArrowLeft size={17}/> : command === "DRIVE RIGHT" ? <ArrowRight size={17}/> : command === "DRIVE BACK" ? <ArrowDown size={17}/> : <Square size={13} fill="currentColor"/>}</button> : <div key={`empty-${index}`}/>)}</div></div></div>
        <div className="rounded-2xl bg-slate-950 p-4 text-white"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-xs font-semibold"><Cpu size={14} className="text-emerald-400"/>Nhật ký Python</h3><span className="text-[10px] text-slate-500">{hardware.pca === true ? "PCA đã khởi tạo" : ""}</span></div><div className="mt-3 max-h-[120px] space-y-2 overflow-auto text-[11px]">{robot?.log.length ? robot.log.slice(0, 8).map((entry, i) => <div key={`${entry.time}-${i}`} className="flex gap-3"><time className="shrink-0 font-mono text-slate-500">{entry.time}</time><span className="text-slate-300">{entry.text}</span></div>) : <p className="text-slate-500">Chưa có thao tác. Kết nối Python để nhận trạng thái thật.</p>}</div></div>
      </div>
    </div>
  </section>;
}
