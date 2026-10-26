import type { Point2D, Pose2D } from "@/lib/geometry";

export type DataMode = "demo" | "live";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export interface OccupancyGrid {
  width: number;
  height: number;
  /** Metres per cell. */
  resolution: number;
  originX: number;
  originY: number;
  /** Row-major, row 0 at originY. -1 unknown, 0..100 occupancy probability. */
  data: Int8Array;
  /** Incremented whenever the grid changes, so renderers can cache. */
  revision: number;
  frameId: string;
}

/** Semantic objects of the demo world. Only the Demo Mode simulator provides these. */
export interface WorldObject {
  id: string;
  kind: "shelf" | "workbench" | "block" | "table" | "wall";
  x: number;
  y: number;
  /** Size along the object's local x axis (m). */
  width: number;
  /** Size along the object's local y axis (m). */
  depth: number;
  height: number;
  yaw: number;
}

export type NavState =
  | "unknown"
  | "idle"
  | "pending"
  | "navigating"
  | "canceling"
  | "succeeded"
  | "canceled"
  | "aborted"
  | "rejected";

export type SimStatus = "running" | "paused" | "stalled" | "no-clock" | "unknown";

export type ComponentState =
  | "active"
  | "inactive"
  | "unconfigured"
  | "finalized"
  | "transitioning"
  | "unavailable"
  | "checking"
  | "unknown";

export interface HealthItem {
  id: string;
  label: string;
  /** Short qualifier such as the loaded plugin name, from real data when available. */
  detail: string | null;
  state: ComponentState;
  /** Human readable explanation (e.g. which node or service was missing). */
  note: string | null;
}

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
export type LogChannel = "ros" | "nav2" | "gazebo" | "system";

export interface LogEntry {
  id: number;
  /** Wall-clock receive time (ms since epoch). */
  time: number;
  level: LogLevel;
  channels: LogChannel[];
  source: string;
  message: string;
  /** Marks messages that indicate success, rendered in green. */
  highlight?: boolean;
}

export interface Capabilities {
  sendGoal: boolean;
  cancelGoal: boolean;
  pauseSim: boolean;
  stopRobot: boolean;
  setInitialPose: boolean;
  /** Explanations shown as tooltips when a capability is unavailable. */
  reasons: Partial<Record<"sendGoal" | "cancelGoal" | "pauseSim" | "stopRobot" | "setInitialPose", string>>;
}

export interface NavigationInfo {
  state: NavState;
  goal: Pose2D | null;
  /** Seconds on the source clock when the current goal started / ended. */
  startedAt: number | null;
  endedAt: number | null;
  initialDistance: number | null;
  distanceRemaining: number | null;
  /** 0..1, null when no goal. */
  progress: number | null;
  /** Distance travelled since the goal started (m). */
  distanceTravelled: number;
  message: string | null;
  /** How the goal was sent in live mode. */
  transport: "action" | "topic" | "simulated" | null;
}

export interface MetricHistory {
  distance: number[];
  elapsed: number[];
  speed: number[];
}

export interface GraphInfo {
  topics: Record<string, string>;
  services: string[];
  nodes: string[];
  rosDistro: string | null;
  checkedAt: number;
}

export interface DashboardState {
  mode: DataMode;
  connection: { status: ConnectionStatus; url: string | null; error: string | null; retryInSec: number | null };
  graph: GraphInfo | null;
  sim: { status: SimStatus; time: number | null };
  map: OccupancyGrid | null;
  world: WorldObject[] | null;
  robot: {
    pose: Pose2D | null;
    poseFrame: string | null;
    /** Seconds (wall) of the last odometry/pose message, used for the "Active" badge. */
    lastUpdate: number | null;
    speed: number | null;
    angularSpeed: number | null;
    battery: number | null;
  };
  globalPath: Point2D[];
  localPath: Point2D[];
  nav: NavigationInfo;
  history: MetricHistory;
  health: HealthItem[];
  healthCheckedAt: number | null;
  logs: LogEntry[];
  capabilities: Capabilities;
}

export interface GoalDraft {
  x: string;
  y: string;
  yaw: string;
}

export type PickMode = "map" | "coordinates";

export interface UiState {
  pickMode: PickMode;
  pickTarget: "goal" | "initialPose";
  draft: GoalDraft;
  /** Draft pose shown as a preview marker while picking on the map. */
  preview: Pose2D | null;
}
