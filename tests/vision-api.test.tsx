// @vitest-environment node
import {afterEach, describe, expect, it, vi} from "vitest";
import {POST} from "../app/api/vision/sync/route";
import {countObjects, parseModalResult} from "../lib/trash-vision";

afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers();});
const object = (bin: number) => ({label: "test object", bin});

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
  it("closes the old sync endpoint without any outgoing network request", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await POST();
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({synced: false, disabled: true});
    expect(fetcher).not.toHaveBeenCalled();
  });
});
