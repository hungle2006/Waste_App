"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RobotRealtimeClient, type AutoState, type RobotRealtimeState } from "@/lib/robot-realtime";
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleStop, Grip, Leaf, Link2, PackageOpen, Pause, Radio,
  Recycle, RotateCcw, Save, ShieldAlert, SlidersHorizontal, Square, Trash2 } from "lucide-react";

type Joint = "p1" | "p10" | "p11" | "d2";
type Pose = "SETUP" | "SEARCH" | "PLACE" | "REAR";
type ControlTab = "arm" | "drive" | "bins" | "auto";
const CONTROL_TABS: { id: ControlTab; title: string }[] = [
  { id: "arm", title: "Cánh tay" }, { id: "drive", title: "Bánh xe" },
  { id: "bins", title: "Thùng & nắp" }, { id: "auto", title: "Auto & lệnh" },
];
type Config = {
  limits: Record<string, [number, number]>;
  poses: Record<Pose, Record<string, number>>;
  grip: { open: number; close: number };
  bins: Record<string, number>;
};
type RobotState = {
  connected: boolean; fresh: boolean; stopped: boolean; busy: boolean;
  simulation: boolean; epoch: number; job: string; progress: number; auto_rear: boolean;
  auto_running?: boolean; auto?: AutoState; command_trace?: RobotRealtimeState["command_trace"];
  hardware: { pca?: boolean; joints?: Record<string, number | null>; motors?: number[]; sensors?: Record<string, number> };
  config: Config; log: { time: string; text: string }[];
};
type Payload = { command: string; speed?: number } | { joint: Joint; pulse_us: number } | { name: Pose; values: Record<"p1" | "p10" | "p11", number> };
type Props = { active: boolean; autoMode?: boolean; onRobotState?: (s: RobotRealtimeState) => void; registerStop: (fn: (() => void) | null) => void;
  onBinChange: (bin: number | null) => void; onCommand: (message: string) => void };

const JOINTS: { id: Joint; name: string; sub: string; value: number }[] = [
  { id: "p1", name: "Khớp cánh tay S2", sub: "Co / duỗi cánh tay", value: 1300 },
  { id: "p10", name: "Khớp cánh tay S1", sub: "Nâng / hạ cánh tay", value: 950 },
  { id: "p11", name: "Trụ xoay cánh tay", sub: "Xoay trái / phải", value: 1250 },
  { id: "d2", name: "Xoay càng kẹp", sub: "Trái 90°: 500 · thẳng: 2100 · phải 60°: 2500 µs", value: 2100 },
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

export default function MechanicalControl({ active, autoMode = false, onRobotState, registerStop, onBinChange, onCommand }: Props) {
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
  const [tab, setTab] = useState<ControlTab>("arm");
  const controlsScrollRef = useRef<HTMLDivElement | null>(null);
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
    onRobotState?.(next);
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
  }, [onBinChange, onRobotState]);

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
    if ("command" in payload && ["STOP", "XM", "HOLD"].includes(payload.command)) {
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
      if (path === "operator" && "command" in payload && payload.command.startsWith("WRIST ")) dirtyRef.current.delete("d2");
      applyState(next);
      if (!(path === "operator" && "command" in payload && payload.command.startsWith("MECHANICS "))) setMessage("command" in payload ? payload.command === "STOP" ? "Đã dừng và hủy chuỗi tư thế." : "Python đã nhận thao tác." : path === "poses" ? "Đã lưu tư thế vào Python." : "Python đã nhận xung khớp.");
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
    if (driveRef.current) return mutate({ command: "XM" }, "command", true);
    return Promise.resolve(true);
  }, [mutate]);

  const startDrive = (mode: string) => {
    const current = robotRef.current;
    if (driveRef.current || pendingRef.current || !active || !connected || !current?.connected ||
        !current.fresh || current.stopped || current.busy || current.auto_running || current.auto_rear) return;
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
    const limits = robot?.config.limits[id] ?? [500, id === "p1" ? 3500 : 2500];
    if (!Number.isInteger(value) || value < limits[0] || value > limits[1]) return;
    dirtyRef.current.add(id);
    draftRef.current = { ...draftRef.current, [id]: value };
    setDraft({ ...draftRef.current });
  }

  const ready = connected && robot?.connected && robot.fresh;
  const moving = Boolean(robot?.hardware.motors?.some(pwm => pwm !== 0));
  const canMove = Boolean(active && ready && !robot?.stopped && !robot?.busy && !robot?.auto_running && !pending && !moving && !driveHeld);
  const canDrive = Boolean(active && ready && !robot?.stopped && !robot?.busy && !robot?.auto_running && !pending && !robot?.auto_rear);
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

  const autoState = robot?.auto;
  const operatorReady = brokerOnline && robot?.fresh && [1,2].includes(autoState?.operator_protocol ?? 0);
  const advancedReady = Boolean(operatorReady && autoState?.operator_protocol === 2);
  const wristPulse = ready ? hardware.joints?.d2 : null;
  const wristAngle = ready && autoState?.wrist?.angle_deg != null ? autoState.wrist.angle_deg : wristPulse != null && wristPulse >= 500 && wristPulse <= 2500 ? (wristPulse-2100)*(wristPulse < 2100 ? 90/1600 : 60/400) : null;
  const wristLabel = wristAngle == null ? "Chưa có góc" : Math.abs(wristAngle) < .1 ? "Thẳng Oy · 0°" : `${wristAngle < 0 ? "Trái" : "Phải"} ${Math.abs(wristAngle).toFixed(0)}°`;
  const mechanicsOn = autoState?.mechanics_enabled !== false;
  const runOperator = async (command: string) => {
    const braking = releaseDrive();
    const generation = generationRef.current;
    if (await braking && generation === generationRef.current) void mutate({command}, "operator");
  };
  const selectTab = (next: ControlTab) => {
    releaseDrive();
    setTab(next);
    controlsScrollRef.current?.scrollTo?.({ top: 0 });
  };
  if (!active) return null;
  return <section id="mechanical-control" aria-label="Bảng điều khiển cơ khí" className="control-panel">
    <div className="control-toolbar">
      <div className="flex min-w-0 items-center gap-2">
        <SlidersHorizontal size={18} className="shrink-0 text-emerald-600"/>
        <div className="min-w-0"><h2 className="text-sm font-bold">Điều khiển cơ khí</h2>
          <p className={`text-[11px] ${ready ? "text-emerald-700" : "text-slate-500"}`}>{ready ? "● Arduino đã kết nối" : "○ Chưa kết nối Arduino"}{robot?.simulation ? " · Mô phỏng" : ""}</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button disabled={pending || configured === false || !brokerOnline} onClick={() => void connect()} className="tool-button"><Link2 size={14}/><span>Kết nối Python</span></button>
        <button type="button" aria-label="Dừng cơ khí" title="Dừng cơ khí" onClick={() => void mutate({command:"STOP"},"command",true)} className="tool-button !border-red-200 !bg-red-50 !text-red-700"><CircleStop size={16}/></button>
      </div>
    </div>
    <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2"><span className="text-[10px] text-slate-500">{autoState?.assist_running ? "Đang thực hiện chu trình gắp/thả" : "Giữ vị trí: giữ xung tay, phanh bánh"}</span><button type="button" disabled={!advancedReady} onClick={() => void mutate({command:"HOLD"},"operator",true)} className="tool-button shrink-0"><Pause size={13}/>Giữ vị trí</button></div>
    {ready && robot.stopped && <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-800"><span>Cơ khí đang khóa sau STOP</span><button disabled={robot.busy || pending} onClick={() => action("RESUME")} className="tool-button !border-emerald-200 !bg-emerald-600 !text-white"><Check size={14}/>Cho phép điều khiển</button></div>}
    <p role="status" className={`control-message ${configured === false ? "text-amber-700" : "text-slate-500"}`}>{configured === false ? "Thiếu cấu hình Supabase của app." : message || (brokerOnline ? "Kết nối Python để nhận trạng thái và điều khiển robot." : "Đang kết nối kênh robot…")}</p>
    {autoMode && <div className="auto-toolbar">
      <button type="button" aria-label="Quyền điều khiển cơ khí của Auto" aria-pressed={mechanicsOn} disabled={!operatorReady || pending || autoState?.transitioning}
        onClick={() => runOperator(mechanicsOn ? "MECHANICS OFF" : "MECHANICS ON")}
        className={`min-h-11 min-w-0 flex-1 rounded-xl px-2 text-xs font-bold text-white disabled:opacity-40 ${mechanicsOn ? "bg-emerald-600" : "bg-red-600"}`}>
        {mechanicsOn ? "● Xanh · AUTO điều khiển" : "● Đỏ · Bạn điều khiển"}</button>
      <button className="tool-button !min-h-11" disabled={!operatorReady || pending || autoState?.auto_running || autoState?.assist_running} onClick={() => runOperator("AUTO START")}>Bắt đầu AUTO</button>
      <button type="button" aria-label="Dừng AUTO" title="Dừng AUTO" className="tool-button !min-h-11" disabled={!brokerOnline} onClick={() => void mutate({command:"STOP"},"command",true)}><Square size={14}/></button>
    </div>}
    <div role="tablist" aria-label="Nhóm điều khiển cơ khí" className="control-tabs">
      {CONTROL_TABS.map((item, index) => <button key={item.id} type="button" role="tab" id={`control-tab-${item.id}`} aria-controls={`control-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1}
        onClick={() => selectTab(item.id)} onKeyDown={event => {
          let next: number | undefined;
          if (event.key === "ArrowRight") next = (index + 1) % CONTROL_TABS.length;
          if (event.key === "ArrowLeft") next = (index + CONTROL_TABS.length - 1) % CONTROL_TABS.length;
          if (event.key === "Home") next = 0;
          if (event.key === "End") next = CONTROL_TABS.length - 1;
          if (next !== undefined) { event.preventDefault(); const id = CONTROL_TABS[next].id; selectTab(id); document.getElementById(`control-tab-${id}`)?.focus(); }
        }} className={tab === item.id ? "is-selected" : ""}>{item.title}</button>)}
    </div>
    <div ref={controlsScrollRef} className="controls-scroll" aria-label="Nội dung bảng điều khiển">
      <div role="tabpanel" id="control-panel-arm" aria-labelledby="control-tab-arm" hidden={tab !== "arm"} tabIndex={0}>
        <div className="mb-3 flex items-center justify-between gap-2"><h3 className="control-section-title"><Grip size={16}/>Càng kẹp</h3><span className="text-[11px] text-slate-500">{robot?.busy ? `${robot.progress}% · đang chạy` : "Xem camera khi chỉnh khớp"}</span></div>
        <div className="grid grid-cols-2 gap-2"><button disabled={!canMove} onClick={() => action("GRIP OPEN")} className={`${button} !border-emerald-200 !bg-emerald-50 !text-emerald-800`}><PackageOpen size={17}/>Mở càng kẹp</button><button disabled={!canMove} onClick={() => action("GRIP CLOSE")} className={button}><Grip size={17}/>Đóng càng kẹp</button></div>
        <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
          <div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="text-xs font-bold">Xoay càng D2 · bước 10°</h3><p className="mt-1 text-[10px] text-slate-500">Góc ước tính theo xung Arduino đã nhận</p></div><output aria-label="Góc xoay càng đã nhận" className="shrink-0 text-sm font-bold text-emerald-800">{wristLabel}</output></div>
          <div className="grid grid-cols-3 gap-2"><button type="button" aria-label="Xoay trái 10 độ" disabled={!advancedReady || !canMove || wristAngle == null || wristAngle <= -89.9} onClick={() => runOperator("WRIST LEFT")} className={button}><ArrowLeft size={14}/>Trái 10°</button><button type="button" aria-label="Đưa càng về 0 độ" disabled={!advancedReady || !canMove || wristAngle == null || Math.abs(wristAngle)<.1} onClick={() => runOperator("WRIST CENTER")} className={button}><RotateCcw size={13}/>0° · Oy</button><button type="button" aria-label="Xoay phải 10 độ" disabled={!advancedReady || !canMove || wristAngle == null || wristAngle >= 59.9} onClick={() => runOperator("WRIST RIGHT")} className={button}>Phải 10°<ArrowRight size={14}/></button></div>
          <p className="mt-2 text-[10px] text-slate-500">Giới hạn trái 90° ↔ phải 60°. Lần nhấn cuối dừng tại giới hạn.</p>
        </div>
        <div className={`mt-3 rounded-2xl border p-3 ${advancedReady && autoState?.sensor_grasp_ready ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
          <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-xs font-bold">Gắp theo cảm biến</h3><span className="text-xs font-semibold text-emerald-700">{ready && autoState?.sensor_tof_mm != null ? `${(autoState.sensor_tof_mm/10).toFixed(1)} cm` : "—"}</span></div>
          <p role="status" className="mb-3 text-[11px] text-slate-600">{!advancedReady ? "Chạy Python V3.16 để dùng nút 10° và gắp theo cảm biến." : autoState?.sensor_grasp_reason || "Đang kiểm tra cảm biến và tư thế tay"}</p>
          <div className="grid grid-cols-2 gap-2"><button type="button" disabled={!advancedReady || !canMove || !autoState?.sensor_grasp_ready} onClick={() => runOperator("GRASP SENSOR")} className={`${button} !border-emerald-600 !bg-emerald-600 !text-white`}><Grip size={15}/>Gắp theo cảm biến</button><button className={button} disabled={!canMove || !operatorReady || (advancedReady ? !autoState?.release_ready : mechanicsOn)} onClick={() => runOperator("RELEASE")}>Thả vật vào thùng</button></div>
          <button type="button" disabled={!advancedReady || !canMove || !autoState?.lift_ready} onClick={() => runOperator("LIFT")} className={`${button} mt-2 w-full`}>Nâng / rút tay · giữ góc kẹp</button>
          <p className="mt-2 text-[10px] text-slate-500">{autoState?.held_bin ? `Ngăn thả đã lưu: BIN ${autoState.held_bin}. ` : "Dùng ngăn bạn đang chọn trong Thùng & nắp. "}VL53 {((autoState?.sensor_min_mm ?? 200)/10).toFixed(0)}–{((autoState?.sensor_max_mm ?? 250)/10).toFixed(0)} cm, 3 mẫu mới; D19 xác nhận mới đóng kẹp.</p>
        </div>
        {autoMode && <button className={`${button} mt-2 w-full`} disabled={!operatorReady || mechanicsOn || pending || autoState?.assist_running || !autoState?.target_fresh || hardware.joints?.d3 !== robot?.config.grip.open} onClick={() => runOperator("GRASP")}>Gắp và nâng vật</button>}
        <div className="mt-3 divide-y divide-slate-100">{JOINTS.map(j => {
          const [min, max] = robot?.config.limits[j.id] ?? [500, j.id === "p1" ? 3500 : 2500];
          const submit = () => { if (canMove) void mutate({joint: j.id, pulse_us: draftRef.current[j.id]}); };
          return <div key={j.id} className="joint-control">
            <div className="flex items-center justify-between gap-2"><label htmlFor={`mechanical-${j.id}`} className="text-xs font-semibold"><span className="mr-2 text-[10px] font-bold text-emerald-700">{j.id.toUpperCase()}</span>{j.name}</label>
              <div className="flex shrink-0 items-center gap-1"><input aria-label={`Xung ${j.name}`} type="number" min={min} max={max} step={1} value={draft[j.id]} onChange={e => editJoint(j.id, Number(e.target.value))} className="w-[72px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm font-bold text-emerald-700 outline-none focus:border-emerald-500"/><span className="text-[10px] text-slate-400">µs</span></div>
            </div>
            <input id={`mechanical-${j.id}`} type="range" min={min} max={max} step={10} value={draft[j.id]} disabled={!canMove} onChange={e => editJoint(j.id, Number(e.target.value))} onPointerUp={submit} onKeyUp={e => {if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(e.key)) submit();}} className="mt-2 h-7 w-full cursor-pointer accent-emerald-600 disabled:opacity-40"/>
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400"><span>{min}–{max} µs</span><span className="text-slate-500">Đã nhận: {acknowledged(j.id)}</span><button disabled={!canMove} onClick={submit} className="min-h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-emerald-700 disabled:opacity-35">Gửi</button></div>
            {j.id === "d2" && <p className="mt-1.5 text-[10px] text-slate-400">{j.sub}</p>}
          </div>;
        })}</div>
        <details className="control-details mt-3"><summary>Tư thế có sẵn & lưu tư thế</summary><div className="mt-3 grid grid-cols-2 gap-2">{POSES.map(p => <button key={p.id} disabled={!canMove} onClick={() => action(p.command)} className={`${button} !block !p-3 !text-left`}><span>{p.title}</span><span className="mt-1 block text-[10px] font-normal text-slate-500">{p.sub}</span></button>)}</div>
          <button onClick={() => setEditing(v => !v)} aria-expanded={editing} className="mt-3 flex min-h-10 items-center gap-2 text-xs font-semibold text-emerald-700"><Save size={14}/>Lưu tư thế<ChevronDown size={14}/></button>
          {editing && <div className="space-y-3 rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Lưu các giá trị thanh kéo vào Python; thao tác lưu không làm tay chuyển động.</p><select aria-label="Tư thế cần lưu" value={pose} onChange={e => setPose(e.target.value as Pose)} className="min-h-10 w-full rounded-lg border bg-white px-2 text-xs">{POSES.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select><div className="grid grid-cols-2 gap-2"><button className={button} disabled={!robot} onClick={() => {
            if (!robot) return; const values = {...draftRef.current};
            for (const j of JOINTS) if (robot.config.poses[pose][j.id] != null) {values[j.id] = robot.config.poses[pose][j.id]; dirtyRef.current.add(j.id);}
            draftRef.current = values; setDraft(values); setMessage("Đã nạp tư thế vào thanh kéo; chưa gửi tới Arduino.");
          }}>Nạp giá trị</button><button disabled={!canMove} onClick={() => void mutate({name: pose, values: {p1: draftRef.current.p1, p10: draftRef.current.p10, p11: draftRef.current.p11}}, "poses")} className={button}><Save size={13}/>Lưu</button></div></div>}
          <p className="mt-3 text-[11px] text-slate-500">Xung đã nhận không phải góc đo thực tế. Khớp nối và càng kẹp điều khiển qua tư thế và nút riêng.</p>
        </details>
      </div>
      <div role="tabpanel" id="control-panel-drive" aria-labelledby="control-tab-drive" hidden={tab !== "drive"} tabIndex={0}>
        <div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="control-section-title"><Radio size={16}/>Di chuyển Mecanum</h3><p className="mt-1 text-xs text-slate-500">Giữ để chạy · thả để dừng</p></div><label className="flex items-center gap-2 text-xs text-slate-500">PWM<input aria-label="PWM bánh xe" type="number" min={1} max={255} value={speed} disabled={Boolean(driveHeld)} onChange={e => {const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 255) setSpeed(n);}} className="w-16 rounded-lg border border-slate-200 px-2 py-2 text-center font-bold text-emerald-700"/></label></div>
        <div className="drive-pad grid grid-cols-3 gap-2">{DIRECTIONS.map(([mode, title, symbol]) => mode === "STOP" ? <button key={mode} aria-label={title} onClick={() => void mutate({command:"XM"}, "command", true)} className="btn flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl bg-slate-950 text-white"><Square size={16} fill="currentColor"/><span className="text-[10px] font-semibold">Dừng bánh</span></button> : driveButton(mode, title, symbol))}</div>
        <div className="mt-2 grid grid-cols-2 gap-2">{TURNS.map(([mode,title,symbol]) => driveButton(mode,title,symbol))}</div>
        {robot?.auto_rear && <p className="mt-3 text-xs text-amber-700">Tắt “Tự phân loại phía sau D18” ở Thùng & nắp để chạy bánh bằng tay.</p>}
        <details className="control-details mt-4"><summary>Cua theo cung & trạng thái 4 bánh</summary><div className="mt-3 grid grid-cols-2 gap-2">{ARCS.map(([mode,title]) => driveButton(mode,title))}</div><div className="mt-3 grid grid-cols-2 gap-2">{WHEELS.map(([name,position,sign],i) => <div key={name} className="rounded-lg bg-slate-50 p-3 text-[10px] text-slate-500"><b>{name}</b> · {position}<span className="float-right font-mono font-bold">{hardware.motors?.[i] ?? "—"}</span><span className="mt-1 block">Chiều tiến: PWM {sign}</span></div>)}</div><p className="mt-3 text-[11px] text-slate-500">Hướng theo robot nhìn từ sau ra trước. Mất lệnh làm mới, Arduino dừng bánh sau tối đa 500 ms.</p></details>
      </div>
      <div role="tabpanel" id="control-panel-bins" aria-labelledby="control-tab-bins" hidden={tab !== "bins"} tabIndex={0}>
        <h3 className="control-section-title mb-3"><Trash2 size={16}/>Chọn ngăn phân loại</h3>
        <div className="grid grid-cols-2 gap-2">{BINS.map(b => {const pulse = robot?.config.bins[b.key] ?? b.pulse; const selected = hardware.joints?.p9 === pulse;
          return <button disabled={!canMove} key={b.key} onClick={() => action(`SORT ${b.key}`)} className={`btn flex items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-40 ${selected ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${b.tone}`}><b.Icon size={19}/></span><span><span className="block text-xs font-semibold">{b.title}</span><span className="mt-1 block text-[10px] text-slate-400">BIN {b.id} · {pulse} µs</span></span></button>;
        })}</div><div className="mt-3 grid grid-cols-2 gap-2"><button disabled={!canMove} onClick={() => action("LID OPEN")} className={button}><PackageOpen size={16}/>Mở nắp</button><button disabled={!canMove} onClick={() => action("LID CLOSE")} className={button}><Square size={14}/>Đóng nắp</button></div><p className="mt-2 text-[11px] text-slate-500">Chọn ngăn chỉ xoay thùng. Nắp và kẹp thao tác riêng.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">{[["D19","IR gắp vật"],["D18","Thùng rác"]].map(([pin,title]) => {const value = hardware.sensors?.[pin]; return <div key={pin} className={`rounded-xl border p-3 ${value === 0 ? "border-emerald-200 bg-emerald-50" : "border-slate-100 bg-slate-50"}`}><div className="text-[10px] text-slate-500">{title} · {pin}</div><div className="mt-1 text-xs font-semibold">{value === 0 ? "Có vật" : value === 1 ? "Không phát hiện" : "Chưa có dữ liệu"}</div></div>;})}</div>
        <details className="control-details mt-3"><summary>Tự phân loại phía sau D18</summary><p className="mt-2 text-xs text-slate-500">D18 → nhìn sau → Modal → xoay ngăn → mở nắp. Đang giữ vật phía trước thì chờ lượt đó hoàn tất.</p><button disabled={!canMove} onClick={() => action(robot?.auto_rear ? "AUTO REAR OFF" : "AUTO REAR ON")} className={`${button} mt-3 w-full`}>{robot?.auto_rear ? "Đang bật · Tắt" : "Bật"}</button></details>
      </div>
      <div role="tabpanel" id="control-panel-auto" aria-labelledby="control-tab-auto" hidden={tab !== "auto"} tabIndex={0}>
        <h3 className="control-section-title"><Radio size={16}/>Auto theo camera</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{autoMode ? mechanicsOn ? "Auto gửi lệnh tới tay, bốn bánh, thùng và nắp. Chuyển nút đỏ để tự điều khiển trong khi camera vẫn nhận diện." : "Camera vẫn nhận diện; lệnh dự kiến chưa gửi tới cơ khí. Chọn Cánh tay, Bánh xe hoặc Thùng & nắp để điều khiển." : "Chọn AUTO ở đầu màn hình để bật nhận diện và chọn quyền điều khiển cơ khí."}</p>
        {!operatorReady && <p className="mt-3 text-xs text-amber-700">Kết nối Python V3.15 để dùng các nút AUTO mới.</p>}
        <div role="status" className={`mt-3 rounded-xl p-3 text-xs ${autoState?.distance_ready ? "bg-emerald-100 text-emerald-900" : "bg-slate-50 text-slate-600"}`}>{autoState?.distance_ready ? `Đã đạt khoảng cách ${((autoState?.sensor_min_mm ?? 200)/10).toFixed(0)}–${((autoState?.sensor_max_mm ?? 250)/10).toFixed(0)} cm · đã xác nhận cảm biến` : "Khoảng cách: chờ mẫu cảm biến hợp lệ"}{autoState?.tof_mm != null && ` · ${(autoState.tof_mm / 10).toFixed(1)} cm`}</div>
        <p className="mt-3 text-xs" role="status">{autoState?.message || "AUTO chưa chạy"}</p>
        <p className="mt-2 text-[11px] text-slate-500">S1 → S2 → xoay càng → đóng kẹp → nâng vật</p>
        <p className="mt-2 text-[11px] text-slate-500">{autoState?.orientation?.angle_deg != null ? `Góc ảnh: ${autoState.orientation.angle_deg.toFixed(1)}° · D2 dự kiến ${autoState.orientation.pulse_us ?? "—"} µs` : autoState?.orientation?.reason || "Góc vật: chờ ảnh"}</p>
        {operatorReady && !autoState?.orientation_enabled && <p className="mt-2 text-[11px] text-amber-700">Xoay theo hướng vật chưa bật: cần hiệu chuẩn camera → D2. Ở chế độ đỏ, đặt D2 trong Cánh tay trước khi gắp.</p>}
        <div className="mt-4 rounded-xl border border-slate-200 p-3"><h3 className="text-xs font-bold">Lệnh AUTO dự kiến</h3><p className="mb-3 mt-1 text-[11px] text-slate-500">Nút đỏ: các lệnh này chưa gửi tới cơ khí.</p><ul className="space-y-2 text-xs">{autoState?.planned_commands?.length ? autoState.planned_commands.map((entry,i) => <li key={i}><b>{entry.component}:</b> {entry.command}</li>) : <li className="text-slate-500">Chờ ảnh mới và mục tiêu ổn định.</li>}</ul></div>
        <div className="mt-3 rounded-xl border border-slate-200 p-3"><h3 className="text-xs font-bold">Lệnh Arduino đã nhận</h3><p className="mb-3 mt-1 text-[11px] text-slate-500">Xác nhận nhận lệnh, chưa phải vị trí đo thực tế.</p><ol className="max-h-44 space-y-2 overflow-auto font-mono text-[11px]">{robot?.command_trace?.length ? robot.command_trace.slice(0,16).map((entry,i) => <li key={i}>{entry.time} · {entry.source} · {entry.command}</li>) : <li className="text-slate-400">Chưa có lệnh được xác nhận.</li>}</ol></div>
        <details className="control-details mt-3"><summary>Nhật ký Python</summary><div className="mt-3 space-y-2 text-[11px]">{robot?.log.length ? robot.log.slice(0,8).map((entry,i) => <div key={`${entry.time}-${i}`} className="flex gap-3"><time className="shrink-0 font-mono text-slate-400">{entry.time}</time><span>{entry.text}</span></div>) : <p className="text-slate-500">Kết nối Python để nhận trạng thái thật.</p>}</div></details>
      </div>
    </div>
  </section>;
}

