import { distance, remainingPathLength, type Point2D, type Pose2D } from "@/lib/geometry";
import type { Store } from "./store";
import type { DashboardState, NavState, NavigationInfo } from "./types";

const HISTORY_LENGTH = 40;
const TERMINAL: NavState[] = ["succeeded", "canceled", "aborted", "rejected"];

export function isTerminal(state: NavState): boolean {
  return TERMINAL.includes(state);
}

export function isGoalActive(state: NavState): boolean {
  return state === "pending" || state === "navigating" || state === "canceling";
}

/**
 * Derives navigation metrics (progress, distance travelled, time taken, speed history)
 * from pose/odometry/path updates. Shared by the demo simulator and the live ROS source,
 * so both report metrics the same way.
 */
export class NavTelemetry {
  private lastOdom: Point2D | null = null;
  private lastSample = -Infinity;

  constructor(
    private readonly store: Store<DashboardState>,
    /** Source clock in seconds (sim time when available). */
    private readonly clock: () => number,
  ) {}

  private patchNav(patch: Partial<NavigationInfo>) {
    this.store.set((s) => ({ nav: { ...s.nav, ...patch } }));
  }

  goalStarted(goal: Pose2D | null, transport: NavigationInfo["transport"]): void {
    this.lastSample = -Infinity;
    this.store.set((s) => ({
      nav: {
        ...s.nav,
        state: "pending",
        goal: goal ?? s.nav.goal,
        startedAt: this.clock(),
        endedAt: null,
        initialDistance: null,
        distanceRemaining: null,
        progress: 0,
        distanceTravelled: 0,
        message: null,
        transport,
      },
      history: { distance: [], elapsed: [], speed: [] },
    }));
  }

  setState(state: NavState, message: string | null = null): void {
    const nav = this.store.get().nav;
    if (nav.state === state && message === null) return;
    const patch: Partial<NavigationInfo> = { state, message };
    if (isTerminal(state) && !isTerminal(nav.state)) {
      patch.endedAt = this.clock();
      if (state === "succeeded") {
        patch.progress = 1;
        patch.distanceRemaining = 0;
      }
    }
    if (state === "navigating" && nav.startedAt === null) patch.startedAt = this.clock();
    this.patchNav(patch);
  }

  /** Odometry position (continuous frame) and linear speed. */
  odometry(position: Point2D, speed: number, angularSpeed: number): void {
    const nav = this.store.get().nav;
    if (this.lastOdom && isGoalActive(nav.state)) {
      const step = distance(this.lastOdom, position);
      // Ignore teleports/resets (e.g. a simulation reset) so they do not count as travel.
      if (step < 1) this.patchNav({ distanceTravelled: nav.distanceTravelled + step });
    }
    this.lastOdom = position;
    this.store.set((s) => ({ robot: { ...s.robot, speed, angularSpeed, lastUpdate: Date.now() / 1000 } }));
  }

  /** Updates remaining distance from the latest global plan. */
  globalPlan(path: Point2D[], robot: Pose2D | null): void {
    const nav = this.store.get().nav;
    if (!isGoalActive(nav.state) || path.length < 2 || !robot) return;
    this.remaining(remainingPathLength(path, robot));
  }

  /** Remaining distance reported by Nav2 feedback (or derived from the plan). */
  remaining(distanceRemaining: number): void {
    const nav = this.store.get().nav;
    if (!isGoalActive(nav.state) || !Number.isFinite(distanceRemaining)) return;
    const initial = Math.max(nav.initialDistance ?? 0, distanceRemaining);
    const progress = initial > 0 ? Math.min(1, Math.max(0, 1 - distanceRemaining / initial)) : 0;
    this.patchNav({ initialDistance: initial, distanceRemaining, progress });
  }

  /** Call periodically; samples sparkline history once per second of source time. */
  tick(): void {
    const now = this.clock();
    if (now - this.lastSample < 1) return;
    this.lastSample = now;
    const s = this.store.get();
    const elapsed = s.nav.startedAt === null ? 0 : (s.nav.endedAt ?? now) - s.nav.startedAt;
    const push = (arr: number[], v: number) => {
      const next = arr.concat(v);
      return next.length > HISTORY_LENGTH ? next.slice(next.length - HISTORY_LENGTH) : next;
    };
    this.store.set({
      history: {
        distance: push(s.history.distance, s.nav.distanceTravelled),
        elapsed: push(s.history.elapsed, elapsed),
        speed: push(s.history.speed, Math.abs(s.robot.speed ?? 0)),
      },
    });
  }

  now(): number {
    return this.clock();
  }
}
