import { makeSupabase } from "./supabase";

export type RobotRealtimeState = {
  connected: boolean; fresh: boolean; stopped: boolean; busy: boolean; simulation: boolean;
  epoch: number; job: string; progress: number; auto_rear: boolean;
  hardware: { pca?: boolean; joints?: Record<string, number | null>; motors?: number[]; sensors?: Record<string, number> };
  config: { limits: Record<string, [number, number]>; poses: Record<string, Record<string, number>>;
    grip: { open: number; close: number }; bins: Record<string, number> };
  log: { time: string; text: string }[];
};

type Ack = { robot_id: string; session_id: string; state_seq: number; client_id: string;
  request_id: string; ok: boolean; error?: string; state: RobotRealtimeState };
type StatePacket = Omit<Ack, "client_id" | "request_id" | "ok">;
const ROBOT_ID = process.env.NEXT_PUBLIC_ROBOT_ID?.trim() || "robot_01";

/** Supabase confirms delivery to its server; a separate robot ACK confirms execution. */
export class RobotRealtimeClient {
  private supabase = makeSupabase();
  private channel: ReturnType<NonNullable<ReturnType<typeof makeSupabase>>["channel"]> | null = null;
  private clientId = crypto.randomUUID();
  private seq = 0;
  private session = "";
  private stateSeq = -1;
  private retiredSessions = new Set<string>();
  private online = false;
  private closed = false;
  private pending = new Map<string, { resolve: (s: RobotRealtimeState) => void; reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout> }>();
  private lastState = 0;
  private last: RobotRealtimeState | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private onState: (state: RobotRealtimeState) => void,
    private onTransport: (online: boolean, configured: boolean) => void) {}

  start() {
    if (!this.supabase) { this.onTransport(false, false); return; }
    this.channel = this.supabase.channel(`robot:${ROBOT_ID}`, { config: { broadcast: { ack: true } } });
    this.channel.on("broadcast", { event: "mechanical_state" }, ({ payload }) => this.accept(payload as StatePacket));
    this.channel.on("broadcast", { event: "mechanical_ack" }, ({ payload }) => {
      const p = payload as Ack;
      if (p.robot_id !== ROBOT_ID || p.client_id !== this.clientId) return;
      this.accept(p);
      const pending = this.pending.get(p.request_id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(p.request_id);
      if (p.ok) pending.resolve(this.last || p.state);
      else pending.reject(new Error(p.error || "Python từ chối lệnh"));
    });
    this.channel.subscribe(status => {
      if (this.closed) return;
      this.online = status === "SUBSCRIBED";
      this.onTransport(this.online, true);
      if (this.online) void this.request("status").catch(() => {});
      else this.invalidate("Mất kết nối Supabase");
    });
    this.staleTimer = setInterval(() => {
      if (this.lastState && Date.now() - this.lastState > 1800 && this.last?.fresh)
        this.invalidate("Python chưa gửi trạng thái mới");
    }, 300);
  }

  private accept(p: StatePacket) {
    if (this.closed || p.robot_id !== ROBOT_ID || !p.session_id || !p.state || !Number.isInteger(p.state_seq) || this.retiredSessions.has(p.session_id)) return;
    if (this.session !== p.session_id) {
      if (this.session) this.retiredSessions.add(this.session);
      this.session = p.session_id; this.stateSeq = -1;
      for (const [id, pending] of this.pending) {
        // Initial read discovers a session. Keep it until its ACK is received.
        if (this.last) { clearTimeout(pending.timer); pending.reject(new Error("Python đã khởi động lại; kết nối lại")); this.pending.delete(id); }
      }
    }
    if (p.state_seq <= this.stateSeq) return;
    this.stateSeq = p.state_seq; this.lastState = Date.now(); this.last = p.state;
    this.onState(p.state);
  }

  private invalidate(reason: string) {
    if (this.last) { this.last = { ...this.last, connected: false, fresh: false, hardware: {}, job: reason }; this.onState(this.last); }
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(reason)); }
    this.pending.clear();
  }

  async request(action: string, payload: unknown = {}): Promise<RobotRealtimeState> {
    if (!this.online || !this.channel || this.closed) throw new Error("Supabase chưa kết nối");
    const body = payload as { command?: string };
    const drive = body.command?.startsWith("DRIVE ");
    const requestId = crypto.randomUUID();
    const packet = { robot_id: ROBOT_ID, type: "mechanics", action, client_id: this.clientId,
      request_id: requestId, session_id: this.session, seq: ++this.seq,
      issued_at: Date.now(), ttl_ms: drive ? 500 : 8000, payload };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error("Python chưa phản hồi qua Supabase; kiểm tra chương trình trên máy robot")); }, 8000);
      this.pending.set(requestId, { resolve, reject, timer });
      void this.channel!.send({ type: "broadcast", event: "command", payload: packet }).then(result => {
        if (result !== "ok") { const p = this.pending.get(requestId); if (p) { clearTimeout(p.timer); this.pending.delete(requestId); p.reject(new Error("Supabase chưa nhận được lệnh")); } }
      }).catch(() => { const p = this.pending.get(requestId); if (p) { clearTimeout(p.timer); this.pending.delete(requestId); p.reject(new Error("Không gửi được lệnh qua Supabase")); } });
    });
  }

  close() {
    if (this.last?.connected && !this.last.stopped && this.online)
      void this.request("command", { command: "STOP", epoch: this.last.epoch }).catch(() => {});
    // Keep the subscription briefly so the final stop can leave the browser.
    this.closed = true;
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.invalidate("Đã đóng kết nối");
    const channel = this.channel;
    setTimeout(() => { if (channel && this.supabase) void this.supabase.removeChannel(channel); }, 100);
  }
}
