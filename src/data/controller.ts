import type { Pose2D } from "@/lib/geometry";
import { DemoSource } from "./demo/DemoSource";
import { LiveRosSource } from "./live/LiveRosSource";
import { settingsStore, type DashboardSettings } from "./settings";
import type { DataSource } from "./source";
import { DEMO_FIRST_GOAL } from "./demo/world";
import { dashboardStore, initialDashboardState, LogSink, uiStore } from "./store";

/** Owns the active data source and restarts it when connection settings change. */
class DashboardController {
  private source: DataSource | null = null;
  private activeKey = "";

  private key(s: DashboardSettings) {
    return s.mode === "demo" ? "demo" : JSON.stringify([s.rosbridgeUrl, s.topics, s.navigateAction, s.mapFrame, s.goalTransport, s.cmdVelType]);
  }

  init(): void {
    this.restart();
    settingsStore.subscribe(() => {
      if (this.key(settingsStore.get()) !== this.activeKey) this.restart();
    });
  }

  restart(): void {
    this.source?.stop();
    const settings = settingsStore.get();
    this.activeKey = this.key(settings);
    dashboardStore.set(initialDashboardState(settings.mode));
    uiStore.set({
      preview: null,
      // Demo Mode pre-fills an example goal inside the demo warehouse.
      draft:
        settings.mode === "demo"
          ? { x: DEMO_FIRST_GOAL.x.toFixed(2), y: DEMO_FIRST_GOAL.y.toFixed(2), yaw: DEMO_FIRST_GOAL.theta.toFixed(2) }
          : { x: "", y: "", yaw: "0.00" },
    });
    this.source = settings.mode === "demo" ? new DemoSource(dashboardStore) : new LiveRosSource(dashboardStore, settings);
    this.source.start();
  }

  private async run(label: string, fn: (s: DataSource) => Promise<void>): Promise<void> {
    if (!this.source) throw new Error("No data source");
    try {
      await fn(this.source);
    } catch (err) {
      const sink = new LogSink(dashboardStore);
      sink.system("ERROR", `${label} failed: ${(err as Error).message}`);
      sink.flush();
      throw err;
    }
  }

  sendGoal = (goal: Pose2D) => this.run("Send goal", (s) => s.sendGoal(goal));
  cancelGoal = () => this.run("Cancel goal", (s) => s.cancelGoal());
  setPaused = (paused: boolean) => this.run(paused ? "Pause" : "Resume", (s) => s.setPaused(paused));
  stopRobot = () => this.run("Stop", (s) => s.stopRobot());
  setInitialPose = (pose: Pose2D) => this.run("Set initial pose", (s) => s.setInitialPose(pose));
  refresh = () => this.source?.refresh();
  clearLogs = (predicate: (channels: string[]) => boolean) =>
    dashboardStore.set((s) => ({ logs: s.logs.filter((l) => !predicate(l.channels)) }));
}

export const controller = new DashboardController();
