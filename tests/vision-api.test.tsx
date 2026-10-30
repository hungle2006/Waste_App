// @vitest-environment node
import {afterEach, describe, expect, it, vi} from "vitest";
import {POST} from "../app/api/vision/sync/route";
import {countObjects, parseModalResult} from "../lib/trash-vision";
import {TrashSync} from "../lib/trash-sync";

afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers();});
const object = (bin: number) => ({label: "test object", bin});
const request = (objects: unknown[], observedAt = Date.now()) => new Request("https://app.example/api/vision/sync", {
  method: "POST", headers: {"Content-Type": "application/json", origin: "https://app.example"},
  body: JSON.stringify({objects, observedAt}),
});

describe("recognition → Firebase", () => {
  it("maps every robot BIN to the existing Firebase fields and counts the current image", () => {
    expect(countObjects([object(1), object(1), object(2), object(3), object(4)])).toEqual({Hazardous: 1, Organic: 1, Others: 1, Recyclable: 2});
    expect(countObjects([])).toEqual({Hazardous: 0, Organic: 0, Others: 0, Recyclable: 0});
  });
  it("supports legacy Modal results and rejects inconsistent or out-of-image boxes", () => {
    const item = {...object(1), bbox: [1, 2, 40, 50]};
    expect(parseModalResult({found: true, object: item}, {width: 100, height: 100})).toEqual([item]);
    expect(() => parseModalResult({found: false, objects: [item]}, {width: 100, height: 100})).toThrow();
    expect(() => parseModalResult({found: true, object: {...item, bbox: [1, 2, 101, 50]}}, {width: 100, height: 100})).toThrow();
  });
  it("patches only the four children at the exact robot path, preserving siblings", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({})); vi.stubGlobal("fetch", fetcher);
    const response = await POST(request([object(3)]));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({synced: true, counts: {Hazardous: 1, Organic: 0, Others: 0, Recyclable: 0}});
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://smart-genaiot-default-rtdb.asia-southeast1.firebasedatabase.app/Robot%20thu%20gom%201/TrashClasses.json");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({Hazardous: 1, Organic: 0, Others: 0, Recyclable: 0});
  });
  it("does not write stale, malformed, or cross-origin observations", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await POST(request([object(8)]))).status).toBe(400);
    expect((await POST(request([object(1)], Date.now() - 40000))).status).toBe(400);
    const cross = request([object(1)]); cross.headers.set("origin", "https://another.example");
    expect((await POST(cross)).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never acknowledges success when Firebase denies the write", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", {status: 401})));
    const response = await POST(request([object(2)]));
    expect(response.status).toBe(502); expect(await response.json()).toMatchObject({synced: false});
    vi.restoreAllMocks();
  });
  it("serializes scene changes and skips duplicate category counts", async () => {
    vi.useFakeTimers();
    let finish: (value: Response) => void = () => {};
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => {finish = resolve;}))
      .mockImplementation(async (_url, init) => Response.json({synced: true, counts: countObjects(JSON.parse(init.body).objects)}));
    vi.stubGlobal("fetch", fetcher);
    const queue = new TrashSync(vi.fn());
    queue.observe([object(1)]); await vi.advanceTimersByTimeAsync(250);
    queue.observe([object(2)]); queue.observe([object(3)]);
    await vi.advanceTimersByTimeAsync(500); expect(fetcher).toHaveBeenCalledTimes(1);
    finish(Response.json({synced: true, counts: countObjects([object(1)])}));
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).objects[0].bin).toBe(3);
    queue.observe([object(3)]); await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).toHaveBeenCalledTimes(2); queue.close();
  });
  it("a waiting or disconnected camera does not reset the database to zero", async () => {
    vi.useFakeTimers(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const queue = new TrashSync(vi.fn());
    queue.observe([object(1)]); queue.observe(null);
    await vi.advanceTimersByTimeAsync(1000); expect(fetcher).not.toHaveBeenCalled(); queue.close();
  });
});
