import type { Pose2D } from "@/lib/geometry";
import type { OccupancyGrid, WorldObject } from "../types";

/** Demo warehouse, in metres. Interior spans x ∈ [0, WIDTH], y ∈ [0, DEPTH]. */
export const WORLD_WIDTH = 6.4;
export const WORLD_DEPTH = 8.0;
const WALL = 0.12;

export const DEMO_START: Pose2D = { x: 3.15, y: 1.45, theta: Math.PI / 2 };
export const DEMO_FIRST_GOAL: Pose2D = { x: 4.6, y: 6.9, theta: 0 };

export const DEMO_WORLD: WorldObject[] = [
  { id: "wall-left", kind: "wall", x: -WALL / 2, y: WORLD_DEPTH / 2, width: WALL, depth: WORLD_DEPTH + 2 * WALL, height: 0.75, yaw: 0 },
  { id: "wall-right", kind: "wall", x: WORLD_WIDTH + WALL / 2, y: WORLD_DEPTH / 2, width: WALL, depth: WORLD_DEPTH + 2 * WALL, height: 0.75, yaw: 0 },
  { id: "wall-back", kind: "wall", x: WORLD_WIDTH / 2, y: WORLD_DEPTH + WALL / 2, width: WORLD_WIDTH, depth: WALL, height: 0.75, yaw: 0 },
  { id: "wall-front", kind: "wall", x: WORLD_WIDTH / 2, y: -WALL / 2, width: WORLD_WIDTH, depth: WALL, height: 0.2, yaw: 0 },
  { id: "shelf-boxes", kind: "shelf", x: 0.42, y: 4.7, width: 0.55, depth: 1.75, height: 1.25, yaw: 0 },
  { id: "workbench", kind: "workbench", x: 2.05, y: 6.75, width: 1.8, depth: 0.55, height: 0.8, yaw: 0 },
  { id: "block-a", kind: "block", x: 3.55, y: 5.6, width: 0.5, depth: 1.05, height: 0.95, yaw: 0.05 },
  { id: "block-b", kind: "block", x: 5.25, y: 4.15, width: 0.62, depth: 1.75, height: 0.95, yaw: 0.12 },
  { id: "block-c", kind: "block", x: 2.6, y: 3.35, width: 0.55, depth: 1.2, height: 0.95, yaw: 0 },
  { id: "table", kind: "table", x: 1.25, y: 2.25, width: 1.5, depth: 0.85, height: 0.72, yaw: 0.42 },
];

export const MAP_RESOLUTION = 0.05;
const MARGIN = 0.35;

function insideObject(o: WorldObject, x: number, y: number, pad = 0): boolean {
  const c = Math.cos(-o.yaw);
  const s = Math.sin(-o.yaw);
  const dx = x - o.x;
  const dy = y - o.y;
  const lx = c * dx - s * dy;
  const ly = s * dx + c * dy;
  return Math.abs(lx) <= o.width / 2 + pad && Math.abs(ly) <= o.depth / 2 + pad;
}

/** Deterministic PRNG so the demo map looks identical on every load. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rasterises the demo world into an occupancy grid, like a map built with SLAM. */
export function buildDemoMap(): OccupancyGrid {
  const originX = -MARGIN;
  const originY = -MARGIN;
  const width = Math.round((WORLD_WIDTH + 2 * MARGIN) / MAP_RESOLUTION);
  const height = Math.round((WORLD_DEPTH + 2 * MARGIN) / MAP_RESOLUTION);
  const data = new Int8Array(width * height);
  const rand = mulberry32(7);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const x = originX + (i + 0.5) * MAP_RESOLUTION;
      const y = originY + (j + 0.5) * MAP_RESOLUTION;
      const inside = x > -WALL && x < WORLD_WIDTH + WALL && y > -WALL && y < WORLD_DEPTH + WALL;
      let v = inside ? 0 : -1;
      for (const o of DEMO_WORLD) {
        if (insideObject(o, x, y)) {
          v = 100;
          break;
        }
        // Ragged edges, as produced by a lidar-built map.
        if (o.kind === "wall" && insideObject(o, x, y, 0.06) && rand() < 0.35) v = 100;
      }
      data[j * width + i] = v;
    }
  }
  return { width, height, resolution: MAP_RESOLUTION, originX, originY, data, revision: 1, frameId: "map" };
}
