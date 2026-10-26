import type { Point2D } from "@/lib/geometry";
import type { OccupancyGrid } from "../types";

export interface Costmap {
  width: number;
  height: number;
  resolution: number;
  originX: number;
  originY: number;
  /** Traversal cost per cell; Infinity = lethal. */
  cost: Float32Array;
}

/**
 * Inflates obstacles like Nav2's inflation layer: cells closer than `robotRadius`
 * to an obstacle are lethal, cost decays exponentially up to `inflationRadius`.
 */
export function buildCostmap(grid: OccupancyGrid, robotRadius = 0.16, inflationRadius = 0.6): Costmap {
  const { width, height, resolution } = grid;
  const n = width * height;
  const dist = new Float32Array(n).fill(Infinity);
  const queue: number[] = [];
  for (let k = 0; k < n; k++) {
    if (grid.data[k] >= 65 || grid.data[k] < 0) {
      dist[k] = 0;
      queue.push(k);
    }
  }
  // Brushfire (8-connected chamfer distance) out to the inflation radius.
  const maxCells = inflationRadius / resolution + 1;
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head];
    const i = k % width;
    const j = (k - i) / width;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= width || nj >= height) continue;
        const nk = nj * width + ni;
        const nd = dist[k] + (di && dj ? Math.SQRT2 : 1);
        if (nd < dist[nk] && nd <= maxCells) {
          dist[nk] = nd;
          queue.push(nk);
        }
      }
    }
  }
  const cost = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const d = dist[k] * resolution;
    if (d <= robotRadius) cost[k] = Infinity;
    else if (d < inflationRadius) cost[k] = 1 + 30 * Math.exp(-6 * (d - robotRadius));
    else cost[k] = 1;
  }
  return { width, height, resolution, originX: grid.originX, originY: grid.originY, cost };
}

export function worldToCell(cm: Costmap, p: Point2D): [number, number] {
  return [Math.floor((p.x - cm.originX) / cm.resolution), Math.floor((p.y - cm.originY) / cm.resolution)];
}

function cellToWorld(cm: Costmap, i: number, j: number): Point2D {
  return { x: cm.originX + (i + 0.5) * cm.resolution, y: cm.originY + (j + 0.5) * cm.resolution };
}

export function isFree(cm: Costmap, p: Point2D): boolean {
  const [i, j] = worldToCell(cm, p);
  if (i < 0 || j < 0 || i >= cm.width || j >= cm.height) return false;
  return Number.isFinite(cm.cost[j * cm.width + i]);
}

/** Binary min-heap keyed by f-score. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, key: number) {
    const a = this.items;
    const k = this.keys;
    a.push(item);
    k.push(key);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]];
      [k[p], k[i]] = [k[i], k[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const k = this.keys;
    const top = a[0];
    const lastItem = a.pop()!;
    const lastKey = k.pop()!;
    if (a.length) {
      a[0] = lastItem;
      k[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [k[m], k[i]] = [k[i], k[m]];
        i = m;
      }
    }
    return top;
  }
}

/** A* over the costmap. Returns a smoothed path in world coordinates, or null when no path exists. */
export function planPath(cm: Costmap, start: Point2D, goal: Point2D): Point2D[] | null {
  const [si, sj] = worldToCell(cm, start);
  const [gi, gj] = worldToCell(cm, goal);
  const { width, height, cost } = cm;
  const inBounds = (i: number, j: number) => i >= 0 && j >= 0 && i < width && j < height;
  if (!inBounds(si, sj) || !inBounds(gi, gj)) return null;
  const goalK = gj * width + gi;
  if (!Number.isFinite(cost[goalK])) return null;

  const n = width * height;
  const g = new Float32Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const startK = sj * width + si;
  g[startK] = 0;
  const h = (i: number, j: number) => Math.hypot(i - gi, j - gj);
  const open = new Heap();
  open.push(startK, h(si, sj));

  while (open.size) {
    const k = open.pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === goalK) break;
    const i = k % width;
    const j = (k - i) / width;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (!inBounds(ni, nj)) continue;
        const nk = nj * width + ni;
        // The start cell may sit inside the inflated zone; allow leaving it.
        const c = Number.isFinite(cost[nk]) ? cost[nk] : k === startK || nk === startK ? 50 : Infinity;
        if (!Number.isFinite(c) || closed[nk]) continue;
        const ng = g[k] + (di && dj ? Math.SQRT2 : 1) * c;
        if (ng < g[nk]) {
          g[nk] = ng;
          parent[nk] = k;
          open.push(nk, ng + h(ni, nj));
        }
      }
    }
  }
  if (!closed[goalK]) return null;

  const cells: Point2D[] = [];
  for (let k = goalK; k !== -1; k = parent[k]) {
    const i = k % width;
    cells.push(cellToWorld(cm, i, (k - i) / width));
  }
  cells.reverse();
  cells[0] = { ...start };
  cells[cells.length - 1] = { ...goal };
  return resample(smooth(cm, cells), cm.resolution);
}

/** Gradient-style path smoothing that keeps every point in free space. */
function smooth(cm: Costmap, path: Point2D[]): Point2D[] {
  if (path.length < 3) return path;
  const out = path.map((p) => ({ ...p }));
  const wData = 0.12;
  const wSmooth = 0.35;
  for (let iter = 0; iter < 120; iter++) {
    for (let i = 1; i < out.length - 1; i++) {
      const nx = out[i].x + wData * (path[i].x - out[i].x) + wSmooth * (out[i - 1].x + out[i + 1].x - 2 * out[i].x);
      const ny = out[i].y + wData * (path[i].y - out[i].y) + wSmooth * (out[i - 1].y + out[i + 1].y - 2 * out[i].y);
      if (isFree(cm, { x: nx, y: ny })) {
        out[i].x = nx;
        out[i].y = ny;
      }
    }
  }
  return out;
}

function resample(path: Point2D[], step: number): Point2D[] {
  if (path.length < 2) return path;
  const out: Point2D[] = [path[0]];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    let t = step - carry;
    while (t <= seg) {
      out.push({ x: a.x + ((b.x - a.x) * t) / seg, y: a.y + ((b.y - a.y) * t) / seg });
      t += step;
    }
    carry = seg - (t - step);
  }
  out.push(path[path.length - 1]);
  return out;
}
