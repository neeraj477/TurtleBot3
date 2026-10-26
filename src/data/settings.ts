import { useSyncExternalStore } from "react";
import { createStore } from "./store";
import type { DataMode } from "./types";

export interface TopicSettings {
  map: string;
  amclPose: string;
  odom: string;
  globalPlan: string;
  localPlan: string;
  battery: string;
  rosout: string;
  clock: string;
  cmdVel: string;
  goalPose: string;
  initialPose: string;
}

export interface DashboardSettings {
  mode: DataMode;
  rosbridgeUrl: string;
  mapFrame: string;
  navigateAction: string;
  /** "auto" uses rosbridge's action ops when available and falls back to the goal_pose topic. */
  goalTransport: "auto" | "action" | "topic";
  cmdVelType: "geometry_msgs/msg/Twist" | "geometry_msgs/msg/TwistStamped";
  robotModel: string;
  topics: TopicSettings;
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  mode: "demo",
  rosbridgeUrl: "ws://localhost:9090",
  mapFrame: "map",
  navigateAction: "/navigate_to_pose",
  goalTransport: "auto",
  cmdVelType: "geometry_msgs/msg/Twist",
  robotModel: "TurtleBot3 Burger",
  topics: {
    map: "/map",
    amclPose: "/amcl_pose",
    odom: "/odom",
    globalPlan: "/plan",
    localPlan: "/local_plan",
    battery: "/battery_state",
    rosout: "/rosout",
    clock: "/clock",
    cmdVel: "/cmd_vel",
    goalPose: "/goal_pose",
    initialPose: "/initialpose",
  },
};

const STORAGE_KEY = "tb3-dashboard-settings-v1";

function load(): DashboardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DashboardSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      topics: { ...DEFAULT_SETTINGS.topics, ...(parsed.topics ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** `?mode=live` or `?mode=demo` in the URL overrides the saved data source. */
function withUrlOverrides(s: DashboardSettings): DashboardSettings {
  try {
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "live" || mode === "demo") return { ...s, mode };
  } catch {
    // Non-browser environment.
  }
  return s;
}

export const settingsStore = createStore<DashboardSettings>(withUrlOverrides(load()));

settingsStore.subscribe(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsStore.get()));
  } catch {
    // Storage may be unavailable (private mode); settings then last for the session only.
  }
});

export function useSettings(): DashboardSettings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get);
}
