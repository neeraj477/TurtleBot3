export interface Point2D {
  x: number;
  y: number;
}

export interface Pose2D extends Point2D {
  /** Heading in radians (counter-clockwise from +x). */
  theta: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function normalizeAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

export function yawFromQuaternion(q: Quaternion): number {
  return Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
}

export function quaternionFromYaw(yaw: number): Quaternion {
  return { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) };
}

/** Returns a ∘ b (b expressed in a's frame, result in a's parent frame). */
export function composePose(a: Pose2D, b: Pose2D): Pose2D {
  const c = Math.cos(a.theta);
  const s = Math.sin(a.theta);
  return {
    x: a.x + c * b.x - s * b.y,
    y: a.y + s * b.x + c * b.y,
    theta: normalizeAngle(a.theta + b.theta),
  };
}

export function inversePose(p: Pose2D): Pose2D {
  const c = Math.cos(p.theta);
  const s = Math.sin(p.theta);
  return { x: -c * p.x - s * p.y, y: s * p.x - c * p.y, theta: normalizeAngle(-p.theta) };
}

export function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pathLength(path: readonly Point2D[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distance(path[i - 1], path[i]);
  return total;
}

/** Length of the path from the point closest to `from` to the end of the path. */
export function remainingPathLength(path: readonly Point2D[], from: Point2D): number {
  if (path.length === 0) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = distance(path[i], from);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return bestDist + pathLength(path.slice(best));
}
