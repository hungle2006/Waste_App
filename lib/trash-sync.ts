import {countObjects, type TrashObject} from "./trash-vision";

export type SyncStatus = {state: "waiting" | "sending" | "synced" | "error"; message: string};
type Observation = {objects: TrashObject[]; observedAt: number; key: string};

/** One request at a time; intermediate scenes are replaced by the newest scene. */
export class TrashSync {
  private desired: Observation | null = null;
  private acknowledged = "";
  private busy = false;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  constructor(private onStatus: (status: SyncStatus) => void) {}

  observe(objects: TrashObject[] | null) {
    if (this.closed) return;
    if (objects === null) {
      this.desired = null;
      clearTimeout(this.timer);
      this.onStatus({state: "waiting", message: "Chờ kết quả nhận diện mới"});
      return;
    }
    const key = JSON.stringify(countObjects(objects));
    this.desired = {objects, key, observedAt: Date.now()};
    if (key === this.acknowledged && !this.busy) {
      this.onStatus({state: "synced", message: "Đã đồng bộ Firebase"});
      return;
    }
    if (!this.busy) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.flush(), 250);
    }
  }

  private async flush() {
    if (this.closed || this.busy || !this.desired || this.desired.key === this.acknowledged) return;
    const observation = this.desired;
    if (Date.now() - observation.observedAt > 30000) {
      this.onStatus({state: "waiting", message: "Kết quả đã cũ; chờ nhận diện mới"}); return;
    }
    this.busy = true;
    this.onStatus({state: "sending", message: "Đang đồng bộ Firebase…"});
    try {
      const response = await fetch("/api/vision/sync", {method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({objects: observation.objects.map(({label, bin}) => ({label, bin})), observedAt: observation.observedAt}),
        signal: AbortSignal.timeout(12000)});
      const result = await response.json();
      if (!response.ok || result.synced !== true || JSON.stringify(result.counts) !== observation.key)
        throw new Error(result.error || "Firebase chưa xác nhận dữ liệu");
      this.acknowledged = observation.key;
      this.failures = 0;
      if (!this.closed && this.desired?.key === observation.key) this.onStatus({state: "synced", message: "Đã đồng bộ Firebase"});
    } catch (error) {
      this.failures++;
      if (!this.closed && this.desired) this.onStatus({state: "error", message: error instanceof Error ? error.message : "Chưa đồng bộ được Firebase"});
    } finally {
      this.busy = false;
      if (!this.closed && this.desired && this.desired.key !== this.acknowledged) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.flush(), this.failures ? Math.min(10000, 1500 * 2 ** Math.min(this.failures - 1, 3)) : 0);
      }
    }
  }

  close() { this.closed = true; this.desired = null; clearTimeout(this.timer); }
}
