import { useSyncExternalStore } from "react";
import type { DashboardState, LogEntry, UiState } from "./types";

type Listener = () => void;

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(listener: Listener): () => void;
}

/** Tiny external store. Notifications are coalesced per microtask so bursts of updates render once. */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    for (const l of listeners) l();
  };
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...p };
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(flush);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const MAX_LOGS = 1000;

export function initialDashboardState(mode: DashboardState["mode"]): DashboardState {
  return {
    mode,
    connection: { status: "idle", url: null, error: null, retryInSec: null },
    graph: null,
    sim: { status: "unknown", time: null },
    map: null,
    world: null,
    robot: { pose: null, poseFrame: null, lastUpdate: null, speed: null, angularSpeed: null, battery: null },
    globalPath: [],
    localPath: [],
    nav: {
      state: "unknown",
      goal: null,
      startedAt: null,
      endedAt: null,
      initialDistance: null,
      distanceRemaining: null,
      progress: null,
      distanceTravelled: 0,
      message: null,
      transport: null,
    },
    history: { distance: [], elapsed: [], speed: [] },
    health: [],
    healthCheckedAt: null,
    logs: [],
    capabilities: {
      sendGoal: false,
      cancelGoal: false,
      pauseSim: false,
      stopRobot: false,
      setInitialPose: false,
      reasons: {},
    },
  };
}

export const dashboardStore = createStore<DashboardState>(initialDashboardState("demo"));

export const uiStore = createStore<UiState>({
  pickMode: "map",
  pickTarget: "goal",
  draft: { x: "", y: "", yaw: "0.00" },
  preview: null,
});

export function useDashboard<S>(selector: (s: DashboardState) => S): S {
  return useSyncExternalStore(dashboardStore.subscribe, () => selector(dashboardStore.get()));
}

export function useUi<S>(selector: (s: UiState) => S): S {
  return useSyncExternalStore(uiStore.subscribe, () => selector(uiStore.get()));
}

let logId = 0;

/** Buffers log entries and appends them to the store at most every 200 ms. */
export class LogSink {
  private buffer: LogEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly store: Store<DashboardState>) {}

  push(entry: Omit<LogEntry, "id" | "time"> & { time?: number }): void {
    logId += 1;
    this.buffer.push({ ...entry, id: logId, time: entry.time ?? Date.now() });
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 200);
  }

  system(level: LogEntry["level"], message: string, highlight = false): void {
    this.push({ level, channels: ["system"], source: "dashboard", message, highlight });
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.buffer.length === 0) return;
    const add = this.buffer;
    this.buffer = [];
    this.store.set((s) => {
      const logs = s.logs.concat(add);
      return { logs: logs.length > MAX_LOGS ? logs.slice(logs.length - MAX_LOGS) : logs };
    });
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.buffer = [];
  }
}
