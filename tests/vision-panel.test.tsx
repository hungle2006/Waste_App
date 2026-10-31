import React from "react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {cleanup, render, screen} from "@testing-library/react";
import VisionPanel, {FrameOverlay, robotRecognition} from "../app/components/VisionPanel";
import type {RobotRealtimeState} from "../lib/robot-realtime";
import {type VisionFrame} from "../lib/trash-vision";

afterEach(() => {cleanup(); vi.unstubAllGlobals();});
const state = {connected: true, fresh: true, auto: {label: "plastic bottle", bin: 1, target_fresh: true}} as RobotRealtimeState;
describe("recognition on the camera panel", () => {
  it("displays recognition changes and analyzed frames without Firebase requests", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const props = {videoRef: {current: null}, trackOnline: false, onFrame: vi.fn()};
    const {rerender} = render(<VisionPanel {...props} robot={state} frame={null}/>);
    expect(screen.getByText("plastic bottle")).toBeTruthy();
    rerender(<VisionPanel {...props} robot={{...state, auto: {...state.auto, label: "can", bin: 4}}} frame={null}/>);
    expect(screen.getByText("can")).toBeTruthy();
    const frame: VisionFrame = {url: "data:image/jpeg;base64,test", width: 640, height: 480, capturedAt: 1,
      objects: [{label: "apple", bin: 2}]};
    rerender(<VisionPanel {...props} robot={state} frame={frame}/>);
    expect(screen.getByText("apple")).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByText(/đồng bộ Firebase/i)).toBeNull();
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
