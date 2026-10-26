import { describe, expect, it } from "vitest";
import {
  composePose,
  inversePose,
  normalizeAngle,
  quaternionFromYaw,
  remainingPathLength,
  yawFromQuaternion,
} from "./geometry";

describe("geometry", () => {
  it("round-trips yaw through quaternions", () => {
    for (const yaw of [-3, -1.2, 0, 0.5, 1.42, 3.1]) {
      expect(yawFromQuaternion(quaternionFromYaw(yaw))).toBeCloseTo(yaw, 9);
    }
  });

  it("normalizes angles into [-pi, pi]", () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(normalizeAngle(-2.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 9);
  });

  it("composes a pose with its inverse to identity", () => {
    const p = { x: 1.5, y: -2, theta: 0.7 };
    const id = composePose(p, inversePose(p));
    expect(id.x).toBeCloseTo(0, 9);
    expect(id.y).toBeCloseTo(0, 9);
    expect(id.theta).toBeCloseTo(0, 9);
  });

  it("measures remaining path length from the closest point", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ];
    expect(remainingPathLength(path, { x: 1, y: 0 })).toBeCloseTo(2, 9);
    expect(remainingPathLength(path, { x: 0, y: 0 })).toBeCloseTo(3, 9);
  });
});
