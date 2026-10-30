import React from "react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {cleanup, render, screen, waitFor} from "@testing-library/react";
import VisionPanel, {FrameOverlay, robotRecognition} from "../app/components/VisionPanel";
import type {RobotRealtimeState} from "../lib/robot-realtime";
import {countObjects, type VisionFrame} from "../lib/trash-vision";

afterEach(() => {cleanup(); vi.unstubAllGlobals();});
const state = {connected: true, fresh: true, auto: {label: "plastic bottle", bin: 1, target_fresh: true}} as RobotRealtimeState;
describe("recognition on the camera panel", () => {
  it("uses the same fresh category for display and Firebase, with no motor commands", async () => {
    const fetcher = vi.fn().mockImplementation(async (_url, init) => Response.json({synced: true, counts: countObjects(JSON.parse(init.body).objects)}));
    vi.stubGlobal("fetch", fetcher);
    render(<VisionPanel robot={state} videoRef={{current: null}} trackOnline={false} frame={null} onFrame={vi.fn()}/>);
    expect(screen.getByText("plastic bottle")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Đã đồng bộ Firebase")).toBeTruthy());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/vision/sync");
    expect(JSON.parse(fetcher.mock.calls[0][1].body).objects).toEqual([{label: "plastic bottle", bin: 1}]);
  });
  it("does not reuse stale or disconnected robot targets", () => {
    expect(robotRecognition({...state, fresh: false})).toBeNull();
    expect(robotRecognition({...state, auto: {...state.auto, target_fresh: false}})).toBeNull();
    expect(robotRecognition({...state, auto: {...state.auto, bin: 9}})).toBeNull();
  });
  it("draws boxes in the exact analyzed image coordinates instead of on newer live video", () => {
    const frame: VisionFrame = {url: "data:image/jpeg;base64,test", width: 640, height: 480, capturedAt: 1,
      objects: [{label: "can", bin: 1, bbox: [50, 60, 150, 180]}]};
    const {container} = render(<FrameOverlay frame={frame}/>);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 640 480");
    expect(container.querySelector("image")?.getAttribute("href")).toBe(frame.url);
    expect(container.querySelector("rect")?.getAttribute("width")).toBe("100");
    expect(screen.getByText("ẢNH ĐÃ PHÂN TÍCH")).toBeTruthy();
  });
});
