import type { Pose2D } from "@/lib/geometry";

/** A provider of dashboard data: either the Demo Mode simulator or a live rosbridge connection. */
export interface DataSource {
  start(): void;
  stop(): void;
  sendGoal(goal: Pose2D): Promise<void>;
  cancelGoal(): Promise<void>;
  setPaused(paused: boolean): Promise<void>;
  /** Cancels navigation and commands zero velocity. */
  stopRobot(): Promise<void>;
  setInitialPose(pose: Pose2D): Promise<void>;
  /** Re-runs graph discovery / health checks where applicable. */
  refresh(): void;
}
