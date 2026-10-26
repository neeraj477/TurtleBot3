import { distance, normalizeAngle, pathLength, type Point2D, type Pose2D } from "@/lib/geometry";
import type { DataSource } from "../source";
import { LogSink, type Store } from "../store";
import { NavTelemetry, isGoalActive } from "../telemetry";
import { channelsForNode, NAV2_COMPONENTS } from "../nav2";
import type { ComponentState, DashboardState, HealthItem, LogLevel } from "../types";
import { buildDemoMap, DEMO_FIRST_GOAL, DEMO_START, DEMO_WORLD } from "./world";
import { buildCostmap, planPath, type Costmap } from "./planner";

const DT = 0.05; // 20 Hz simulation step
const MAX_V = 0.22; // TurtleBot3 Burger max linear velocity (m/s)
const MAX_W = 1.8;
const LOOKAHEAD = 0.4;
const XY_TOLERANCE = 0.12;
const YAW_TOLERANCE = 0.12;
const REPLAN_PERIOD = 1.0; // Nav2 default: replan at 1 Hz

const DEMO_PLUGINS: Record<string, string> = { planner: "NavFn", controller: "Pure Pursuit" };

/**
 * Demo Mode: an in-browser simulation of a TurtleBot3 running Nav2 in a warehouse.
 * Every value it produces is simulated; the UI labels it as demo data.
 */
export class DemoSource implements DataSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private simTime = 0;
  private paused = false;
  private pose: Pose2D = { ...DEMO_START };
  private v = 0;
  private w = 0;
  private path: Point2D[] = [];
  private lastPlan = 0;
  private lastPathLog = 0;
  private battery = 0.86;
  private readonly costmap: Costmap;
  private readonly logs: LogSink;
  private readonly telemetry: NavTelemetry;
  private stackReady = false;

  constructor(private readonly store: Store<DashboardState>) {
    this.logs = new LogSink(store);
    this.telemetry = new NavTelemetry(store, () => this.simTime);
    const map = buildDemoMap();
    this.costmap = buildCostmap(map);
    store.set({
      map,
      world: DEMO_WORLD,
      connection: { status: "connected", url: null, error: null, retryInSec: null },
      graph: null,
      sim: { status: "running", time: 0 },
      robot: { pose: { ...this.pose }, poseFrame: "map", lastUpdate: null, speed: 0, angularSpeed: 0, battery: this.battery },
      globalPath: [],
      localPath: [],
      health: NAV2_COMPONENTS.map((c) => this.healthItem(c.id, c.label, "unconfigured")),
      healthCheckedAt: Date.now(),
      capabilities: {
        sendGoal: false,
        cancelGoal: false,
        pauseSim: true,
        stopRobot: true,
        setInitialPose: true,
        reasons: { sendGoal: "Nav2 (demo) is still starting up" },
      },
    });
    this.telemetry.setState("idle");
  }

  private healthItem(id: string, label: string, state: ComponentState): HealthItem {
    return { id, label, detail: DEMO_PLUGINS[id] ?? null, state, note: "Simulated (Demo Mode)" };
  }

  private log(source: string, level: LogLevel, message: string, highlight = false) {
    this.logs.push({ source, level, message, channels: channelsForNode(source), highlight });
  }

  private later(sec: number, fn: () => void) {
    this.timeouts.push(setTimeout(fn, sec * 1000));
  }

  start(): void {
    this.logs.system("INFO", "Demo Mode started — all telemetry on this page is simulated in the browser.");
    this.log("gazebo", "INFO", "[demo] Loading world 'demo_warehouse'");
    this.log("spawn_entity", "INFO", "[demo] Spawn status: SpawnEntity: Successfully spawned entity [burger]");
    this.log("lifecycle_manager_navigation", "INFO", "Starting managed nodes bringup...");

    // Simulated lifecycle bringup, so the health panel shows its transitional states.
    NAV2_COMPONENTS.forEach((c, i) => {
      this.later(0.3 + i * 0.2, () => {
        this.setHealth(c.id, "inactive");
        if (c.id !== "lifecycle") this.log("lifecycle_manager_navigation", "INFO", `Configuring ${c.nodes[0]?.replace(/^\//, "") ?? c.id}`);
      });
      this.later(1.6 + i * 0.15, () => this.setHealth(c.id, "active"));
    });
    this.later(2.6, () => {
      this.stackReady = true;
      this.log("lifecycle_manager_navigation", "INFO", "Managed nodes are active");
      this.log("bt_navigator", "INFO", "Nav2 stack initialized successfully", true);
      this.store.set((s) => ({ capabilities: { ...s.capabilities, sendGoal: true, cancelGoal: true, reasons: {} } }));
    });
    // Send one demonstration goal so the dashboard shows navigation in progress.
    this.later(3.4, () => {
      if (!isGoalActive(this.store.get().nav.state)) void this.sendGoal(DEMO_FIRST_GOAL);
    });

    this.timer = setInterval(() => this.step(), DT * 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.timeouts.forEach(clearTimeout);
    this.timeouts = [];
    this.logs.flush();
    this.logs.dispose();
  }

  refresh(): void {
    this.store.set({ healthCheckedAt: Date.now() });
  }

  private setHealth(id: string, state: ComponentState) {
    this.store.set((s) => ({ health: s.health.map((h) => (h.id === id ? { ...h, state } : h)) }));
  }

  async sendGoal(goal: Pose2D): Promise<void> {
    if (!this.stackReady) throw new Error("Nav2 (demo) is not active yet");
    this.log("bt_navigator", "INFO", `Received goal request: (${goal.x.toFixed(2)}, ${goal.y.toFixed(2)}, ${goal.theta.toFixed(2)})`);
    this.telemetry.goalStarted(goal, "simulated");
    this.log(
      "bt_navigator",
      "INFO",
      `Begin navigating from current location (${this.pose.x.toFixed(2)}, ${this.pose.y.toFixed(2)}) to (${goal.x.toFixed(2)}, ${goal.y.toFixed(2)})`,
    );
    this.log("planner_server", "INFO", "Planning path...");
    if (!this.replan()) return;
    this.log("planner_server", "INFO", `Path found (${pathLength(this.path).toFixed(2)} m). Executing...`);
    this.log("controller_server", "INFO", "Received a goal, begin computing control effort.");
    this.log("controller_server", "INFO", "Controller: following path");
    this.telemetry.setState("navigating");
  }

  /** Returns false (and aborts the goal) when no path exists. */
  private replan(): boolean {
    const goal = this.store.get().nav.goal;
    if (!goal) return false;
    const path = planPath(this.costmap, this.pose, goal);
    this.lastPlan = this.simTime;
    if (!path) {
      this.path = [];
      this.v = 0;
      this.w = 0;
      this.store.set({ globalPath: [], localPath: [] });
      this.log("planner_server", "ERROR", "GridBased: failed to create plan, goal is in collision or unreachable.");
      this.log("bt_navigator", "WARN", "Goal failed");
      this.telemetry.setState("aborted", "No valid path to the goal");
      return false;
    }
    this.path = path;
    this.store.set({ globalPath: path });
    this.telemetry.globalPlan(path, this.pose);
    return true;
  }

  async cancelGoal(): Promise<void> {
    if (!isGoalActive(this.store.get().nav.state)) return;
    this.endGoal("canceled");
    this.log("controller_server", "INFO", "Goal was canceled. Stopping the robot.");
    this.log("bt_navigator", "WARN", "Goal canceled");
  }

  private endGoal(state: "canceled" | "succeeded") {
    this.path = [];
    this.v = 0;
    this.w = 0;
    this.store.set({ globalPath: [], localPath: [] });
    this.telemetry.setState(state);
  }

  async setPaused(paused: boolean): Promise<void> {
    this.paused = paused;
    this.store.set((s) => ({ sim: { ...s.sim, status: paused ? "paused" : "running" } }));
    this.log("gazebo", "INFO", paused ? "[demo] Physics paused" : "[demo] Physics resumed");
  }

  async stopRobot(): Promise<void> {
    await this.cancelGoal();
    this.v = 0;
    this.w = 0;
    this.logs.system("WARN", "Stop requested: navigation canceled and zero velocity commanded (demo).");
  }

  async setInitialPose(pose: Pose2D): Promise<void> {
    await this.cancelGoal();
    this.pose = { ...pose };
    this.store.set((s) => ({ robot: { ...s.robot, pose: { ...pose } } }));
    this.log("amcl", "INFO", `Setting pose: (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}, ${pose.theta.toFixed(2)})`);
  }

  private step(): void {
    if (this.paused) return;
    this.simTime += DT;
    const nav = this.store.get().nav;
    if (nav.state === "navigating" && nav.goal) this.control(nav.goal);

    this.pose = {
      x: this.pose.x + this.v * Math.cos(this.pose.theta) * DT,
      y: this.pose.y + this.v * Math.sin(this.pose.theta) * DT,
      theta: normalizeAngle(this.pose.theta + this.w * DT),
    };
    this.battery = Math.max(0, this.battery - (this.v > 0 ? 0.00025 : 0.00004) * DT);

    this.store.set((s) => ({
      sim: { ...s.sim, time: this.simTime },
      robot: { ...s.robot, pose: { ...this.pose }, battery: this.battery },
    }));
    this.telemetry.odometry(this.pose, this.v, this.w);
    this.telemetry.tick();
  }

  /** Regulated pure-pursuit controller, roughly matching Nav2 behaviour on a TurtleBot3. */
  private control(goal: Pose2D): void {
    if (this.simTime - this.lastPlan >= REPLAN_PERIOD) {
      if (!this.replan()) return;
      if (this.simTime - this.lastPathLog >= 15) {
        this.lastPathLog = this.simTime;
        this.log("controller_server", "INFO", "Passing new path to controller.");
      }
    }
    const distToGoal = distance(this.pose, goal);
    if (distToGoal < XY_TOLERANCE) {
      const yawErr = normalizeAngle(goal.theta - this.pose.theta);
      this.v = 0;
      this.store.set({ localPath: [] });
      if (Math.abs(yawErr) < YAW_TOLERANCE) {
        this.w = 0;
        this.endGoal("succeeded");
        this.log("controller_server", "INFO", "Reached the goal!");
        this.log("bt_navigator", "INFO", "Reached goal!", true);
        return;
      }
      this.w = Math.sign(yawErr) * Math.min(MAX_W * 0.6, Math.abs(yawErr) * 2 + 0.2);
      return;
    }

    // Nearest path point, then the look-ahead point.
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < this.path.length; i++) {
      const d = distance(this.path[i], this.pose);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    let target = this.path[this.path.length - 1] ?? goal;
    let acc = 0;
    for (let i = nearest + 1; i < this.path.length; i++) {
      acc += distance(this.path[i - 1], this.path[i]);
      if (acc >= LOOKAHEAD) {
        target = this.path[i];
        break;
      }
    }
    const local = [{ x: this.pose.x, y: this.pose.y }];
    acc = 0;
    for (let i = nearest + 1; i < this.path.length && acc < 1.0; i++) {
      acc += distance(this.path[i - 1], this.path[i]);
      local.push(this.path[i]);
    }
    this.store.set({ localPath: local });

    const heading = Math.atan2(target.y - this.pose.y, target.x - this.pose.x);
    const alpha = normalizeAngle(heading - this.pose.theta);
    if (Math.abs(alpha) > 0.9) {
      this.v = 0;
      this.w = Math.sign(alpha) * MAX_W * 0.7;
    } else {
      const v = Math.min(MAX_V * (1 - Math.abs(alpha) / 1.4), 0.5 * distToGoal + 0.04);
      const curvature = (2 * Math.sin(alpha)) / LOOKAHEAD;
      this.v = Math.max(0.03, v);
      this.w = Math.max(-MAX_W, Math.min(MAX_W, this.v * curvature));
    }
    this.telemetry.remaining(pathLength(local.slice(0, 1).concat(this.path.slice(nearest))));
  }
}
