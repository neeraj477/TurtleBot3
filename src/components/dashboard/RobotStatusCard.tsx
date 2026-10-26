import { Bot } from "lucide-react";
import { useDashboard } from "@/data/store";
import type { NavState } from "@/data/types";
import type { Pose2D } from "@/lib/geometry";
import { formatNumber } from "@/lib/format";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { DemoBadge } from "./DemoBadge";
import { useNow } from "./useNow";

const NAV_LABEL: Record<NavState, { text: string; tone: BadgeProps["tone"] }> = {
  unknown: { text: "Unknown", tone: "muted" },
  idle: { text: "Idle", tone: "muted" },
  pending: { text: "Goal Accepted", tone: "info" },
  navigating: { text: "Navigating", tone: "ok" },
  canceling: { text: "Canceling", tone: "warn" },
  succeeded: { text: "Goal Reached", tone: "ok" },
  canceled: { text: "Canceled", tone: "warn" },
  aborted: { text: "Aborted", tone: "err" },
  rejected: { text: "Rejected", tone: "err" },
};

function BatteryRing({ value }: { value: number | null }) {
  const size = 88;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value));
  const color = value === null ? "#2a3b60" : pct < 0.2 ? "#ef4444" : pct < 0.4 ? "#f5a524" : "#22c55e";
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1a2a4a" strokeWidth={stroke} />
          {value !== null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${c * pct} ${c}`}
            />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[18px] font-semibold">
          {value === null ? <span className="text-[13px] font-medium text-fg-muted">N/A</span> : `${Math.round(pct * 100)}%`}
        </span>
      </div>
      <span className="mt-2 text-[13px] text-fg-muted" title={value === null ? "No sensor_msgs/BatteryState received" : undefined}>
        Battery
      </span>
    </div>
  );
}

function PoseRow({ pose }: { pose: Pose2D | null }) {
  if (!pose) return <p className="mt-1.5 text-[14px] text-fg-subtle">Unavailable</p>;
  return (
    <p className="mt-1.5 grid grid-cols-[auto_auto_auto] justify-between gap-x-3 text-[14px] tabular-nums">
      <span>
        <span className="text-fg-muted">x:</span> {formatNumber(pose.x)}
      </span>
      <span>
        <span className="text-fg-muted">y:</span> {formatNumber(pose.y)}
      </span>
      <span>
        <span className="text-fg-muted">θ:</span> {formatNumber(pose.theta)} rad
      </span>
    </p>
  );
}

export function RobotStatusCard({ className }: { className?: string }) {
  const robot = useDashboard((s) => s.robot);
  const nav = useDashboard((s) => s.nav);
  const connection = useDashboard((s) => s.connection.status);
  const now = useNow(1000);

  const fresh = robot.lastUpdate !== null && now - robot.lastUpdate < 2.5;
  const status: { text: string; tone: BadgeProps["tone"]; title: string } =
    connection !== "connected"
      ? { text: "Offline", tone: "err", title: "Not connected to ROS 2" }
      : fresh
        ? { text: "Active", tone: "ok", title: "Odometry received within the last 2.5 s" }
        : { text: "No Data", tone: "warn", title: "No odometry received recently" };
  const navLabel = NAV_LABEL[nav.state];

  return (
    <Panel
      icon={<Bot strokeWidth={2.2} />}
      title="Robot Status"
      className={className}
      bodyClassName="flex items-start gap-4 px-4 pb-4 pt-[18px]"
      actions={
        <>
          <DemoBadge />
          <Badge tone={status.tone} title={status.title}>
            {status.text}
          </Badge>
        </>
      }
    >
      <BatteryRing value={robot.battery} />
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] text-[#c8d3e7]">
          Current Pose
          {robot.poseFrame && robot.poseFrame !== "map" && (
            <span className="ml-1 text-[11px] text-warn" title="AMCL pose not received; showing odometry">
              ({robot.poseFrame} frame)
            </span>
          )}
        </h3>
        <PoseRow pose={robot.pose} />
        <h3 className="mt-4 text-[14px] text-[#c8d3e7]">Goal Pose</h3>
        <PoseRow pose={nav.goal} />
        <div className="mt-[18px] flex flex-wrap items-center justify-between gap-2">
          <span className="whitespace-nowrap text-[14px] text-[#c8d3e7]">Navigation State</span>
          <Badge tone={navLabel.tone} className="h-[30px] px-2.5 text-[13px]" title={nav.message ?? undefined}>
            {navLabel.text}
          </Badge>
        </div>
      </div>
    </Panel>
  );
}
