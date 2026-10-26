import type { ComponentState, LogChannel, LogLevel, NavState } from "./types";

/** action_msgs/msg/GoalStatus codes. */
export function navStateFromGoalStatus(status: number): NavState {
  switch (status) {
    case 1:
      return "pending";
    case 2:
      return "navigating";
    case 3:
      return "canceling";
    case 4:
      return "succeeded";
    case 5:
      return "canceled";
    case 6:
      return "aborted";
    default:
      return "unknown";
  }
}

/** lifecycle_msgs/msg/State ids. */
export function componentStateFromLifecycle(id: number): ComponentState {
  switch (id) {
    case 1:
      return "unconfigured";
    case 2:
      return "inactive";
    case 3:
      return "active";
    case 4:
      return "finalized";
    default:
      return id >= 10 ? "transitioning" : "unknown";
  }
}

/** rcl_interfaces/msg/Log levels. */
export function logLevelFromRosout(level: number): LogLevel {
  if (level >= 50) return "FATAL";
  if (level >= 40) return "ERROR";
  if (level >= 30) return "WARN";
  if (level >= 20) return "INFO";
  return "DEBUG";
}

const NAV2_NODE_PATTERNS = [
  /bt_navigator/,
  /controller_server/,
  /planner_server/,
  /behavior_server/,
  /recoveries_server/,
  /smoother_server/,
  /waypoint_follower/,
  /velocity_smoother/,
  /collision_monitor/,
  /lifecycle_manager/,
  /costmap/,
  /amcl/,
  /map_server/,
  /nav2/,
];

const GAZEBO_NODE_PATTERNS = [/gazebo/, /gzserver/, /gzclient/, /spawn_entity/, /diff_drive/, /gz_/, /ros_gz/, /turtlebot3_/];

export function channelsForNode(name: string): LogChannel[] {
  const channels: LogChannel[] = ["ros"];
  if (NAV2_NODE_PATTERNS.some((p) => p.test(name))) channels.push("nav2");
  else if (GAZEBO_NODE_PATTERNS.some((p) => p.test(name))) channels.push("gazebo");
  return channels;
}

export interface Nav2ComponentSpec {
  id: string;
  label: string;
  /** Lifecycle nodes whose `get_state` must all report active. */
  nodes: string[];
  /** Lifecycle managers checked through their `is_active` (std_srvs/Trigger) service. */
  managers?: string[];
  /** Node + parameter listing plugin ids, used to show the loaded plugin (e.g. "NavfnPlanner"). */
  plugins?: { node: string; listParam: string };
}

export const NAV2_COMPONENTS: Nav2ComponentSpec[] = [
  {
    id: "lifecycle",
    label: "Lifecycle Manager",
    nodes: [],
    managers: ["/lifecycle_manager_localization", "/lifecycle_manager_navigation"],
  },
  { id: "amcl", label: "AMCL (Localization)", nodes: ["/amcl", "/map_server"] },
  {
    id: "costmap",
    label: "Costmap (Global/Local)",
    nodes: ["/global_costmap/global_costmap", "/local_costmap/local_costmap"],
  },
  { id: "planner", label: "Planner", nodes: ["/planner_server"], plugins: { node: "/planner_server", listParam: "planner_plugins" } },
  {
    id: "controller",
    label: "Controller",
    nodes: ["/controller_server"],
    plugins: { node: "/controller_server", listParam: "controller_plugins" },
  },
  { id: "bt", label: "Behavior Tree (NavigateToPose)", nodes: ["/bt_navigator"] },
];

/** "nav2_navfn_planner/NavfnPlanner" -> "NavfnPlanner", "dwb_core::DWBLocalPlanner" -> "DWB". */
export function shortPluginName(plugin: string): string {
  const last = plugin.split(/::|\//).pop() ?? plugin;
  if (/^DWB/.test(last)) return "DWB";
  if (/^Smac/.test(last)) return "Smac";
  if (/MPPI/i.test(last)) return "MPPI";
  return last.replace(/(Planner|Controller)$/, "") || last;
}
