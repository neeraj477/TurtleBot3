import {
  composePose,
  inversePose,
  quaternionFromYaw,
  yawFromQuaternion,
  type Point2D,
  type Pose2D,
  type Quaternion,
} from "@/lib/geometry";
import { RosbridgeClient } from "@/ros/rosbridge";
import type { DashboardSettings } from "../settings";
import type { DataSource } from "../source";
import { LogSink, type Store } from "../store";
import { NavTelemetry, isGoalActive, isTerminal } from "../telemetry";
import {
  channelsForNode,
  componentStateFromLifecycle,
  logLevelFromRosout,
  NAV2_COMPONENTS,
  navStateFromGoalStatus,
  shortPluginName,
  type Nav2ComponentSpec,
} from "../nav2";
import type { Capabilities, ComponentState, DashboardState, GraphInfo, HealthItem, OccupancyGrid } from "../types";

// ---- ROS message shapes (only the fields this dashboard reads) ----
interface RosTime {
  sec: number;
  nanosec: number;
}
interface RosHeader {
  frame_id: string;
  stamp?: RosTime;
}
interface RosPose {
  position: { x: number; y: number; z: number };
  orientation: Quaternion;
}
interface OccupancyGridMsg {
  header: RosHeader;
  info: { width: number; height: number; resolution: number; origin: RosPose };
  data: number[];
}
interface PoseWithCovarianceStampedMsg {
  header: RosHeader;
  pose: { pose: RosPose };
}
interface PoseStampedMsg {
  header: RosHeader;
  pose: RosPose;
}
interface OdometryMsg {
  header: RosHeader;
  pose: { pose: RosPose };
  twist: { twist: { linear: { x: number; y: number }; angular: { z: number } } };
}
interface PathMsg {
  header: RosHeader;
  poses: PoseStampedMsg[];
}
interface BatteryStateMsg {
  percentage: number;
}
interface LogMsg {
  level: number;
  name: string;
  msg: string;
}
interface ClockMsg {
  clock: RosTime;
}
interface GoalStatusArrayMsg {
  status_list: { goal_info: { goal_id: { uuid: unknown }; stamp: RosTime }; status: number }[];
}
interface NavigateToPoseFeedback {
  distance_remaining?: number;
}

const EXPECTED_TYPES: Record<keyof DashboardSettings["topics"], string> = {
  map: "nav_msgs/msg/OccupancyGrid",
  amclPose: "geometry_msgs/msg/PoseWithCovarianceStamped",
  odom: "nav_msgs/msg/Odometry",
  globalPlan: "nav_msgs/msg/Path",
  localPlan: "nav_msgs/msg/Path",
  battery: "sensor_msgs/msg/BatteryState",
  rosout: "rcl_interfaces/msg/Log",
  clock: "rosgraph_msgs/msg/Clock",
  cmdVel: "geometry_msgs/msg/Twist",
  goalPose: "geometry_msgs/msg/PoseStamped",
  initialPose: "geometry_msgs/msg/PoseWithCovarianceStamped",
};

const NAVIGATE_TO_POSE_TYPE = "nav2_msgs/action/NavigateToPose";
const toSec = (t?: RosTime) => (t ? t.sec + t.nanosec * 1e-9 : 0);
const poseFromRos = (p: RosPose): Pose2D => ({
  x: p.position.x,
  y: p.position.y,
  theta: yawFromQuaternion(p.orientation),
});

const DISCONNECTED_CAPS: Capabilities = {
  sendGoal: false,
  cancelGoal: false,
  pauseSim: false,
  stopRobot: false,
  setInitialPose: false,
  reasons: {
    sendGoal: "Not connected to rosbridge",
    cancelGoal: "Not connected to rosbridge",
    pauseSim: "Not connected to rosbridge",
    stopRobot: "Not connected to rosbridge",
    setInitialPose: "Not connected to rosbridge",
  },
};

/**
 * Live mode: connects to rosbridge_server and maps TurtleBot3 / Nav2 topics, services and
 * actions onto the dashboard state. Nothing here is simulated — missing data stays empty.
 */
export class LiveRosSource implements DataSource {
  private client: RosbridgeClient | null = null;
  private cleanups: (() => void)[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private retryDelay = 1;
  private readonly logs: LogSink;
  private readonly telemetry: NavTelemetry;

  private actionOpSupported: boolean | null = null;
  private currentGoalRequestId: string | null = null;
  private awaitingGoal = false;
  private goalWatchdog: ReturnType<typeof setTimeout> | null = null;
  private knownGoalIds = new Set<string>();
  private statusInitialized = false;

  private odomPose: Pose2D | null = null;
  private odomFrame = "odom";
  private mapToOdom: Pose2D | null = null;
  private simTime: number | null = null;
  private lastClockAdvance = 0;
  private pauseRequested = false;
  private mapRevision = 0;
  private pluginCache = new Map<string, string | null>();
  private healthBusy = false;

  constructor(
    private readonly store: Store<DashboardState>,
    private readonly settings: DashboardSettings,
  ) {
    this.logs = new LogSink(store);
    this.telemetry = new NavTelemetry(store, () => this.simTime ?? Date.now() / 1000);
  }

  // ---------------------------------------------------------------- lifecycle

  start(): void {
    this.logs.system("INFO", `Live mode: connecting to rosbridge at ${this.settings.rosbridgeUrl}`);
    this.store.set({
      capabilities: DISCONNECTED_CAPS,
      health: NAV2_COMPONENTS.map((c) => this.healthItem(c, "unknown", null, "Waiting for connection")),
    });
    this.telemetry.setState("unknown");
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearReconnect();
    this.teardown();
    this.client?.close();
    this.client = null;
    this.logs.flush();
    this.logs.dispose();
  }

  refresh(): void {
    const status = this.store.get().connection.status;
    if (status === "error" || status === "disconnected") {
      this.clearReconnect();
      this.retryDelay = 1;
      void this.connect();
    } else if (status === "connected") {
      void this.discoverGraph().then(() => this.pollHealth());
    }
  }

  private clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.reconnectTimer = null;
    this.countdownTimer = null;
  }

  private teardown() {
    for (const c of this.cleanups) c();
    this.cleanups = [];
    if (this.goalWatchdog) clearTimeout(this.goalWatchdog);
    this.goalWatchdog = null;
  }

  private every(ms: number, fn: () => void) {
    const id = setInterval(fn, ms);
    this.cleanups.push(() => clearInterval(id));
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const url = this.settings.rosbridgeUrl;
    this.store.set({ connection: { status: "connecting", url, error: null, retryInSec: null } });
    const client = new RosbridgeClient(url);
    this.client = client;
    try {
      await client.connect();
    } catch (err) {
      if (this.stopped) return;
      this.scheduleReconnect((err as Error).message);
      return;
    }
    if (this.stopped) {
      client.close();
      return;
    }
    this.retryDelay = 1;
    this.store.set({ connection: { status: "connected", url, error: null, retryInSec: null } });
    this.logs.system("INFO", `Connected to rosbridge at ${url}`);
    client.onClose((reason) => this.handleDisconnect(reason));
    client.onStatus((st) => {
      if (st.level === "error" || st.level === "warning") this.logs.system(st.level === "error" ? "ERROR" : "WARN", `rosbridge: ${st.msg}`);
    });

    await this.discoverGraph();
    if (!client.isOpen) return;
    this.subscribeAll(client);
    void this.pollHealth();
    this.every(5000, () => void this.pollHealth());
    this.every(15000, () => void this.discoverGraph());
    this.every(500, () => this.watchClock());
    this.every(500, () => this.telemetry.tick());
  }

  private handleDisconnect(reason: string) {
    this.teardown();
    this.client = null;
    this.logs.system("ERROR", `Disconnected from rosbridge: ${reason}`);
    this.store.set((s) => ({
      capabilities: DISCONNECTED_CAPS,
      health: s.health.map((h) => ({ ...h, state: "unknown" as ComponentState, note: "Disconnected" })),
      sim: { status: "unknown", time: s.sim.time },
      robot: { ...s.robot, speed: null, angularSpeed: null, lastUpdate: null },
    }));
    if (isGoalActive(this.store.get().nav.state)) this.telemetry.setState("unknown", "Connection lost during navigation");
    this.statusInitialized = false;
    this.scheduleReconnect(reason);
  }

  private scheduleReconnect(error: string) {
    if (this.stopped) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 15);
    let remaining = delay;
    this.store.set((s) => ({ connection: { ...s.connection, status: "error", error, retryInSec: remaining } }));
    this.clearReconnect();
    this.countdownTimer = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      this.store.set((s) => ({ connection: { ...s.connection, retryInSec: remaining } }));
    }, 1000);
    this.reconnectTimer = setTimeout(() => {
      this.clearReconnect();
      void this.connect();
    }, delay * 1000);
  }

  // ---------------------------------------------------------------- graph

  private async discoverGraph(): Promise<void> {
    const client = this.client;
    if (!client?.isOpen) return;
    const [topics, services, nodes, version] = await Promise.allSettled([
      client.callService<{ topics: string[]; types: string[] }>("/rosapi/topics", {}, undefined, 4000),
      client.callService<{ services: string[] }>("/rosapi/services", {}, undefined, 4000),
      client.callService<{ nodes: string[] }>("/rosapi/nodes", {}, undefined, 4000),
      client.callService<{ version: number; distro: string }>("/rosapi/get_ros_version", {}, undefined, 4000),
    ]);
    if (topics.status !== "fulfilled" || services.status !== "fulfilled") {
      const firstRun = this.store.get().graph === null;
      if (firstRun) {
        const reason = topics.status === "rejected" ? (topics.reason as Error).message : "";
        this.logs.system(
          "WARN",
          `rosapi is not available (${reason}); topics and services cannot be verified. Launch rosbridge with rosbridge_websocket_launch.xml, which starts rosapi.`,
        );
      }
      this.updateCapabilities(null);
      return;
    }
    const topicMap: Record<string, string> = {};
    topics.value.topics.forEach((t, i) => (topicMap[t] = topics.value.types[i] ?? ""));
    const graph: GraphInfo = {
      topics: topicMap,
      services: services.value.services,
      nodes: nodes.status === "fulfilled" ? nodes.value.nodes : [],
      rosDistro: version.status === "fulfilled" ? version.value.distro : null,
      checkedAt: Date.now(),
    };
    const previous = this.store.get().graph;
    this.store.set({ graph });
    if (!previous) this.reportGraph(graph);
    this.updateCapabilities(graph);
  }

  private reportGraph(graph: GraphInfo) {
    this.logs.system(
      "INFO",
      `ROS graph: ${Object.keys(graph.topics).length} topics, ${graph.services.length} services, ${graph.nodes.length} nodes${
        graph.rosDistro ? ` (ROS 2 ${graph.rosDistro})` : ""
      }`,
    );
    const t = this.settings.topics;
    const checks: [keyof typeof t, string][] = [
      ["map", "map panels stay empty"],
      ["odom", "speed and distance are unavailable"],
      ["amclPose", "the robot is shown in the odom frame (not localized)"],
      ["globalPlan", "the global path is not shown"],
      ["localPlan", "the local path is not shown"],
      ["battery", "battery is shown as unavailable"],
      ["clock", "simulation time is unavailable"],
    ];
    for (const [key, consequence] of checks) {
      const actual = graph.topics[t[key]];
      if (actual === undefined) this.logs.system("WARN", `Topic ${t[key]} is not in the ROS graph yet — ${consequence}.`);
      else if (actual !== EXPECTED_TYPES[key])
        this.logs.system("ERROR", `Topic ${t[key]} has type ${actual}, expected ${EXPECTED_TYPES[key]}; not subscribing.`);
    }
    if (!this.navigationAvailable(graph))
      this.logs.system("WARN", `Nav2 action server ${this.settings.navigateAction} not found (no bt_navigator node).`);
  }

  private navigationAvailable(graph: GraphInfo | null): boolean {
    if (!graph) return true; // unverifiable: allow the attempt and report errors
    const action = this.settings.navigateAction;
    return (
      graph.nodes.some((n) => n.endsWith("bt_navigator")) ||
      graph.services.includes(`${action}/_action/send_goal`) ||
      graph.topics[`${action}/_action/status`] !== undefined
    );
  }

  private updateCapabilities(graph: GraphInfo | null) {
    if (!this.client?.isOpen) return;
    const nav = this.navigationAvailable(graph);
    const pause = graph ? graph.services.includes("/pause_physics") && graph.services.includes("/unpause_physics") : false;
    const amcl = graph ? graph.nodes.some((n) => n.endsWith("/amcl")) : true;
    const reasons: Capabilities["reasons"] = {};
    if (!nav) {
      reasons.sendGoal = `Nav2 action server ${this.settings.navigateAction} not found in the ROS graph`;
      reasons.cancelGoal = reasons.sendGoal;
    }
    if (!pause)
      reasons.pauseSim = graph
        ? "Gazebo /pause_physics service not found (requires Gazebo Classic with gazebo_ros_init)"
        : "Cannot verify Gazebo services without rosapi";
    if (!amcl) reasons.setInitialPose = "AMCL node not found";
    this.store.set({
      capabilities: { sendGoal: nav, cancelGoal: nav, pauseSim: pause, stopRobot: true, setInitialPose: amcl, reasons },
    });
  }

  // ---------------------------------------------------------------- subscriptions

  private subscribeAll(client: RosbridgeClient) {
    const t = this.settings.topics;
    const graph = this.store.get().graph;
    const sub = <M>(key: keyof typeof t, handler: (m: M) => void, throttleRate = 0, queueLength = 1) => {
      const actual = graph?.topics[t[key]];
      if (actual !== undefined && actual !== EXPECTED_TYPES[key]) return;
      try {
        this.cleanups.push(client.subscribe<M>(t[key], EXPECTED_TYPES[key], handler, { throttleRate, queueLength }));
      } catch (err) {
        this.logs.system("ERROR", `Failed to subscribe to ${t[key]}: ${(err as Error).message}`);
      }
    };

    sub<OccupancyGridMsg>("map", (m) => this.onMap(m), 1000);
    sub<OdometryMsg>("odom", (m) => this.onOdom(m), 50);
    sub<PoseWithCovarianceStampedMsg>("amclPose", (m) => this.onAmcl(m));
    sub<PathMsg>("globalPlan", (m) => this.onPath(m, "globalPath"), 250);
    sub<PathMsg>("localPlan", (m) => this.onPath(m, "localPath"), 150);
    sub<BatteryStateMsg>("battery", (m) => this.onBattery(m), 1000);
    sub<LogMsg>("rosout", (m) => this.onRosout(m), 0, 100);
    sub<ClockMsg>("clock", (m) => this.onClock(m), 250);
    sub<PoseStampedMsg>("goalPose", (m) => this.onExternalGoal(m));
    try {
      this.cleanups.push(
        client.subscribe<GoalStatusArrayMsg>(
          `${this.settings.navigateAction}/_action/status`,
          "action_msgs/msg/GoalStatusArray",
          (m) => this.onGoalStatus(m),
          { queueLength: 5 },
        ),
      );
    } catch (err) {
      this.logs.system("ERROR", `Failed to subscribe to action status: ${(err as Error).message}`);
    }
  }

  private onMap(m: OccupancyGridMsg) {
    const yaw = yawFromQuaternion(m.info.origin.orientation);
    if (Math.abs(yaw) > 1e-3 && this.mapRevision === 0)
      this.logs.system("WARN", "Map origin is rotated; the dashboard renders maps axis-aligned.");
    this.mapRevision += 1;
    const grid: OccupancyGrid = {
      width: m.info.width,
      height: m.info.height,
      resolution: m.info.resolution,
      originX: m.info.origin.position.x,
      originY: m.info.origin.position.y,
      data: Int8Array.from(m.data),
      revision: this.mapRevision,
      frameId: m.header.frame_id || this.settings.mapFrame,
    };
    this.store.set({ map: grid });
  }

  private onOdom(m: OdometryMsg) {
    this.odomFrame = m.header.frame_id || this.odomFrame;
    this.odomPose = poseFromRos(m.pose.pose);
    const tw = m.twist.twist;
    const speed = Math.hypot(tw.linear.x, tw.linear.y);
    this.telemetry.odometry(this.odomPose, speed, tw.angular.z);
    this.publishRobotPose();
  }

  private onAmcl(m: PoseWithCovarianceStampedMsg) {
    const mapPose = poseFromRos(m.pose.pose);
    // Estimate map->odom from the latest odometry so the pose stays smooth between AMCL updates.
    this.mapToOdom = this.odomPose ? composePose(mapPose, inversePose(this.odomPose)) : null;
    if (!this.mapToOdom) this.store.set((s) => ({ robot: { ...s.robot, pose: mapPose, poseFrame: m.header.frame_id || "map" } }));
    else this.publishRobotPose();
  }

  private publishRobotPose() {
    if (!this.odomPose) return;
    const pose = this.mapToOdom ? composePose(this.mapToOdom, this.odomPose) : this.odomPose;
    const frame = this.mapToOdom ? this.settings.mapFrame : this.odomFrame;
    this.store.set((s) => ({ robot: { ...s.robot, pose, poseFrame: frame } }));
  }

  private toMapFrame(p: Point2D, frame: string): Point2D {
    if (frame === this.odomFrame && this.mapToOdom) {
      const r = composePose(this.mapToOdom, { x: p.x, y: p.y, theta: 0 });
      return { x: r.x, y: r.y };
    }
    return p;
  }

  private onPath(m: PathMsg, key: "globalPath" | "localPath") {
    const frame = m.header.frame_id;
    const pts = m.poses.map((ps) => this.toMapFrame({ x: ps.pose.position.x, y: ps.pose.position.y }, frame));
    this.store.set({ [key]: pts } as Partial<DashboardState>);
    if (key === "globalPath" && this.currentGoalRequestId === null) this.telemetry.globalPlan(pts, this.store.get().robot.pose);
  }

  private onBattery(m: BatteryStateMsg) {
    let pct = m.percentage;
    if (!Number.isFinite(pct)) pct = NaN;
    else if (pct > 1) pct = pct / 100; // some drivers publish 0-100
    this.store.set((s) => ({ robot: { ...s.robot, battery: Number.isFinite(pct) ? pct : null } }));
  }

  private onRosout(m: LogMsg) {
    const level = logLevelFromRosout(m.level);
    this.logs.push({
      source: m.name,
      level,
      message: m.msg,
      channels: channelsForNode(m.name),
      highlight: /reached the goal|goal succeeded|reached goal/i.test(m.msg),
    });
  }

  private onClock(m: ClockMsg) {
    const t = toSec(m.clock);
    if (this.simTime === null || t > this.simTime) this.lastClockAdvance = Date.now();
    if (this.simTime !== null && t + 1 < this.simTime) this.logs.system("WARN", "Simulation clock jumped backwards (simulation reset?)");
    this.simTime = t;
    this.store.set((s) => ({ sim: { ...s.sim, time: t } }));
  }

  private watchClock() {
    let status: DashboardState["sim"]["status"];
    if (this.simTime === null) status = "no-clock";
    else if (Date.now() - this.lastClockAdvance > 1500) status = this.pauseRequested ? "paused" : "stalled";
    else status = "running";
    if (this.store.get().sim.status !== status) this.store.set((s) => ({ sim: { ...s.sim, status } }));
  }

  private onExternalGoal(m: PoseStampedMsg) {
    const goal = poseFromRos(m.pose);
    this.store.set((s) => ({ nav: { ...s.nav, goal } }));
  }

  private onGoalStatus(m: GoalStatusArrayMsg) {
    const list = m.status_list ?? [];
    if (!this.statusInitialized) {
      // Goals that existed before we connected: remember them, but do not treat them as new.
      this.statusInitialized = true;
      list.forEach((g) => this.knownGoalIds.add(JSON.stringify(g.goal_info.goal_id.uuid)));
      const latest = list.reduce<(typeof list)[number] | null>(
        (a, g) => (!a || toSec(g.goal_info.stamp) >= toSec(a.goal_info.stamp) ? g : a),
        null,
      );
      if (!latest) this.telemetry.setState("idle");
      else if (isTerminal(navStateFromGoalStatus(latest.status)))
        this.telemetry.setState("idle", `Last goal before connecting: ${navStateFromGoalStatus(latest.status)}`);
      else {
        this.telemetry.goalStarted(null, null);
        this.telemetry.setState(navStateFromGoalStatus(latest.status), "Goal was already running when the dashboard connected");
      }
      return;
    }
    if (list.length === 0) return;
    const latest = list.reduce((a, g) => (toSec(g.goal_info.stamp) >= toSec(a.goal_info.stamp) ? g : a));
    const key = JSON.stringify(latest.goal_info.goal_id.uuid);
    if (!this.knownGoalIds.has(key)) {
      this.knownGoalIds.add(key);
      if (this.awaitingGoal) {
        this.awaitingGoal = false;
        if (this.goalWatchdog) clearTimeout(this.goalWatchdog);
      } else {
        // A goal sent by another client (e.g. RViz "Nav2 Goal").
        this.logs.system("INFO", "Nav2 accepted a goal sent from another client.");
        this.telemetry.goalStarted(null, null);
      }
    }
    const state = navStateFromGoalStatus(latest.status);
    if (state === this.store.get().nav.state) return;
    this.telemetry.setState(state);
    if (state === "succeeded") this.logs.system("INFO", "Nav2 reports the goal succeeded.", true);
    if (state === "aborted") this.logs.system("ERROR", "Nav2 aborted the goal.");
    if (state === "canceled") this.logs.system("WARN", "Nav2 reports the goal was canceled.");
    if (isTerminal(state)) this.currentGoalRequestId = null;
  }

  // ---------------------------------------------------------------- health

  private healthItem(spec: Nav2ComponentSpec, state: ComponentState, detail: string | null, note: string | null): HealthItem {
    return { id: spec.id, label: spec.label, state, detail, note };
  }

  private async pollHealth(): Promise<void> {
    const client = this.client;
    if (!client?.isOpen || this.healthBusy) return;
    this.healthBusy = true;
    try {
      const graph = this.store.get().graph;
      const services = graph ? new Set(graph.services) : null;
      const items = await Promise.all(NAV2_COMPONENTS.map((spec) => this.checkComponent(client, spec, services)));
      if (client.isOpen) this.store.set({ health: items, healthCheckedAt: Date.now() });
    } finally {
      this.healthBusy = false;
    }
  }

  private async checkComponent(client: RosbridgeClient, spec: Nav2ComponentSpec, services: Set<string> | null): Promise<HealthItem> {
    const states: ComponentState[] = [];
    const notes: string[] = [];
    for (const node of spec.nodes) {
      const svc = `${node}/get_state`;
      if (services && !services.has(svc)) {
        states.push("unavailable");
        notes.push(`${node} not running`);
        continue;
      }
      try {
        const r = await client.callService<{ current_state: { id: number; label: string } }>(svc, {}, "lifecycle_msgs/srv/GetState", 3000);
        const st = componentStateFromLifecycle(r.current_state.id);
        states.push(st);
        if (st !== "active") notes.push(`${node}: ${r.current_state.label}`);
      } catch (err) {
        states.push("unavailable");
        notes.push(`${svc}: ${(err as Error).message}`);
      }
    }
    for (const mgr of spec.managers ?? []) {
      const svc = `${mgr}/is_active`;
      if (services && !services.has(svc)) continue;
      try {
        const r = await client.callService<{ success: boolean }>(svc, {}, "std_srvs/srv/Trigger", 3000);
        states.push(r.success ? "active" : "inactive");
        if (!r.success) notes.push(`${mgr}: managed nodes not active`);
      } catch (err) {
        states.push("unavailable");
        notes.push(`${svc}: ${(err as Error).message}`);
      }
    }
    if (spec.managers && states.length === 0) notes.push("No Nav2 lifecycle manager found");

    const order: ComponentState[] = ["unavailable", "unknown", "finalized", "unconfigured", "transitioning", "inactive"];
    const state: ComponentState =
      states.length === 0 ? "unavailable" : states.every((s) => s === "active") ? "active" : (order.find((o) => states.includes(o)) ?? "unknown");

    let detail: string | null = null;
    if (spec.plugins && state === "active") detail = await this.pluginName(client, spec.plugins.node, spec.plugins.listParam);
    return this.healthItem(spec, state, detail, notes.length ? notes.join("; ") : null);
  }

  private async pluginName(client: RosbridgeClient, node: string, listParam: string): Promise<string | null> {
    const key = `${node}:${listParam}`;
    if (this.pluginCache.has(key)) return this.pluginCache.get(key) ?? null;
    type Params = { values: { string_value?: string; string_array_value?: string[] }[] };
    try {
      const svc = `${node}/get_parameters`;
      const list = await client.callService<Params>(svc, { names: [listParam] }, "rcl_interfaces/srv/GetParameters", 3000);
      const id = list.values[0]?.string_array_value?.[0];
      if (!id) throw new Error("no plugin id");
      const plugin = await client.callService<Params>(svc, { names: [`${id}.plugin`] }, "rcl_interfaces/srv/GetParameters", 3000);
      const name = plugin.values[0]?.string_value;
      const short = name ? shortPluginName(name) : null;
      this.pluginCache.set(key, short);
      return short;
    } catch {
      this.pluginCache.set(key, null);
      return null;
    }
  }

  // ---------------------------------------------------------------- commands

  private requireClient(): RosbridgeClient {
    if (!this.client?.isOpen) throw new Error("Not connected to rosbridge");
    return this.client;
  }

  private poseStamped(p: Pose2D) {
    return {
      header: { frame_id: this.settings.mapFrame, stamp: { sec: 0, nanosec: 0 } },
      pose: { position: { x: p.x, y: p.y, z: 0 }, orientation: quaternionFromYaw(p.theta) },
    };
  }

  async sendGoal(goal: Pose2D): Promise<void> {
    const client = this.requireClient();
    const caps = this.store.get().capabilities;
    if (!caps.sendGoal) throw new Error(caps.reasons.sendGoal ?? "Navigation is unavailable");
    const mode = this.settings.goalTransport;
    const useAction = mode === "action" || (mode === "auto" && this.actionOpSupported !== false);
    this.awaitingGoal = true;
    this.store.set((s) => ({ nav: { ...s.nav, goal } }));
    this.logs.system("INFO", `Sending goal (${goal.x.toFixed(2)}, ${goal.y.toFixed(2)}, ${goal.theta.toFixed(2)}) via ${useAction ? "action" : "topic"}`);
    if (useAction) this.sendViaAction(client, goal);
    else this.sendViaTopic(client, goal);

    if (this.goalWatchdog) clearTimeout(this.goalWatchdog);
    this.goalWatchdog = setTimeout(() => {
      if (!this.awaitingGoal) return;
      this.awaitingGoal = false;
      this.logs.system("WARN", "No status from Nav2 within 5 s of sending the goal. Is bt_navigator active and the robot localized?");
      if (this.store.get().nav.state === "pending") this.telemetry.setState("unknown", "No response from Nav2");
    }, 5000);
  }

  private sendViaAction(client: RosbridgeClient, goal: Pose2D) {
    this.telemetry.goalStarted(goal, "action");
    const id = client.sendActionGoal<NavigateToPoseFeedback>(
      this.settings.navigateAction,
      NAVIGATE_TO_POSE_TYPE,
      { pose: this.poseStamped(goal), behavior_tree: "" },
      {
        onFeedback: (fb) => {
          if (typeof fb.distance_remaining === "number") this.telemetry.remaining(fb.distance_remaining);
        },
        onResult: (_r, status, ok) => {
          this.actionOpSupported = true;
          if (this.currentGoalRequestId === id) this.currentGoalRequestId = null;
          if (status !== null) this.telemetry.setState(navStateFromGoalStatus(status));
          else if (!ok) this.telemetry.setState("aborted", "Nav2 reported a failed result");
        },
        onError: (message) => {
          if (this.currentGoalRequestId === id) this.currentGoalRequestId = null;
          if (this.settings.goalTransport === "auto" && /unknown op|send_action_goal|not supported/i.test(message)) {
            this.actionOpSupported = false;
            this.logs.system("WARN", `rosbridge does not support action goals (${message}); falling back to ${this.settings.topics.goalPose}.`);
            if (this.client?.isOpen) this.sendViaTopic(this.client, goal);
            return;
          }
          this.awaitingGoal = false;
          this.logs.system("ERROR", `Goal request failed: ${message}`);
          this.telemetry.setState("rejected", message);
        },
      },
    );
    this.currentGoalRequestId = id;
  }

  private sendViaTopic(client: RosbridgeClient, goal: Pose2D) {
    this.telemetry.goalStarted(goal, "topic");
    client.publish(this.settings.topics.goalPose, "geometry_msgs/msg/PoseStamped", this.poseStamped(goal));
  }

  async cancelGoal(): Promise<void> {
    const client = this.requireClient();
    if (this.currentGoalRequestId) {
      client.cancelActionGoal(this.settings.navigateAction, this.currentGoalRequestId);
      this.logs.system("INFO", "Cancel requested for the current goal.");
      return;
    }
    // Cancel all goals: zero UUID and zero stamp (action_msgs/srv/CancelGoal semantics).
    const r = await client.callService<{ return_code: number }>(
      `${this.settings.navigateAction}/_action/cancel_goal`,
      { goal_info: { goal_id: { uuid: new Array(16).fill(0) }, stamp: { sec: 0, nanosec: 0 } } },
      "action_msgs/srv/CancelGoal",
      4000,
    );
    const codes = ["accepted", "rejected", "unknown goal", "goal already terminated"];
    this.logs.system(r.return_code === 0 ? "INFO" : "WARN", `Cancel request ${codes[r.return_code] ?? `returned ${r.return_code}`}.`);
  }

  async setPaused(paused: boolean): Promise<void> {
    const client = this.requireClient();
    if (!this.store.get().capabilities.pauseSim) throw new Error(this.store.get().capabilities.reasons.pauseSim ?? "Pause unavailable");
    await client.callService(paused ? "/pause_physics" : "/unpause_physics", {}, "std_srvs/srv/Empty", 4000);
    this.pauseRequested = paused;
    this.logs.system("INFO", paused ? "Gazebo physics paused." : "Gazebo physics resumed.");
  }

  async stopRobot(): Promise<void> {
    const client = this.requireClient();
    if (isGoalActive(this.store.get().nav.state)) {
      try {
        await this.cancelGoal();
      } catch (err) {
        this.logs.system("ERROR", `Cancel failed: ${(err as Error).message}`);
      }
    }
    const zero = { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } };
    const stamped = this.settings.cmdVelType === "geometry_msgs/msg/TwistStamped";
    const msg = stamped ? { header: { frame_id: "base_link", stamp: { sec: 0, nanosec: 0 } }, twist: zero } : zero;
    for (let i = 0; i < 3; i++) {
      client.publish(this.settings.topics.cmdVel, this.settings.cmdVelType, msg);
      await new Promise((r) => setTimeout(r, 100));
    }
    this.logs.system("WARN", `Stop: published zero velocity on ${this.settings.topics.cmdVel}.`);
  }

  async setInitialPose(pose: Pose2D): Promise<void> {
    const client = this.requireClient();
    const covariance = new Array(36).fill(0);
    covariance[0] = 0.25;
    covariance[7] = 0.25;
    covariance[35] = 0.06853891945200942;
    const ps = this.poseStamped(pose);
    client.publish(this.settings.topics.initialPose, "geometry_msgs/msg/PoseWithCovarianceStamped", {
      header: ps.header,
      pose: { pose: ps.pose, covariance },
    });
    this.logs.system("INFO", `Published initial pose (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}, ${pose.theta.toFixed(2)}).`);
  }
}
