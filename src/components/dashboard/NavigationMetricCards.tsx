import type { ReactNode } from "react";
import { Clock, Gauge, LocateFixed, Navigation } from "lucide-react";
import { useDashboard } from "@/data/store";
import { isGoalActive } from "@/data/telemetry";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/ui/sparkline";

function MetricCard({ icon, title, children, className }: { icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("panel flex h-[110px] flex-col px-4 pb-3 pt-3", className)} aria-label={title}>
      <header className="flex items-center gap-2.5 text-[12px] text-[#c8d3e7] [&_svg]:size-[19px] [&_svg]:text-fg">
        {icon}
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  );
}

function ProgressCard() {
  const nav = useDashboard((s) => s.nav);
  const pct = nav.progress === null ? null : Math.round(nav.progress * 100);
  let message: { text: string; className: string };
  switch (nav.state) {
    case "succeeded":
      message = { text: "Goal reached successfully!", className: "text-ok-fg" };
      break;
    case "navigating":
    case "pending":
      message = {
        text: nav.distanceRemaining !== null ? `Navigating — ${nav.distanceRemaining.toFixed(2)} m remaining` : "Navigating…",
        className: "text-[#7fb0ff]",
      };
      break;
    case "aborted":
    case "rejected":
      message = { text: nav.message ?? "Goal failed", className: "text-err-fg" };
      break;
    case "canceled":
    case "canceling":
      message = { text: "Goal canceled", className: "text-warn" };
      break;
    default:
      message = { text: nav.message ?? "No active goal", className: "text-fg-subtle" };
  }
  return (
    <MetricCard
      title="Navigation Progress"
      icon={
        <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft">
          <Navigation className="!size-4 fill-current" />
        </span>
      }
    >
      <div className="mt-2 flex items-center gap-3">
        <div
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#1a2a4a]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
          aria-label="Navigation progress"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct ?? 0}%` }} />
        </div>
        <span className="w-10 text-right text-[11px] tabular-nums text-fg">{pct === null ? "—" : `${pct} %`}</span>
      </div>
      <p className={cn("mt-2.5 truncate text-[11px]", message.className)}>{message.text}</p>
    </MetricCard>
  );
}

export function NavigationMetricCards({ className }: { className?: string }) {
  const nav = useDashboard((s) => s.nav);
  const history = useDashboard((s) => s.history);
  const speed = useDashboard((s) => s.robot.speed);
  const simTime = useDashboard((s) => s.sim.time);
  const hasGoal = nav.startedAt !== null;
  // Time taken uses the same clock as the data source (sim time when available).
  const nowSec = simTime ?? Date.now() / 1000;
  const elapsed = hasGoal ? (nav.endedAt ?? (isGoalActive(nav.state) ? nowSec : nav.startedAt!)) - nav.startedAt! : null;

  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-[1.24fr_0.88fr_0.96fr_0.96fr] xl:gap-[13px]", className)}>
      <ProgressCard />
      <MetricCard title="Distance Travelled" icon={<LocateFixed />}>
        <div className="mt-3 flex items-end justify-between gap-2">
          <span className="whitespace-nowrap text-[18px] font-medium tabular-nums">{hasGoal ? `${nav.distanceTravelled.toFixed(2)} m` : "—"}</span>
          <Sparkline values={history.distance} width={100} height={30} className="min-w-0 shrink" />
        </div>
      </MetricCard>
      <MetricCard title="Time Taken" icon={<Clock />}>
        <div className="mt-3 flex items-end justify-between gap-2">
          <span className="whitespace-nowrap text-[18px] font-medium tabular-nums">{formatDuration(elapsed)}</span>
          <Sparkline values={history.elapsed} width={120} height={30} className="min-w-0 shrink" />
        </div>
      </MetricCard>
      <MetricCard title="Current Speed" icon={<Gauge />}>
        <div className="mt-3 flex items-end justify-between gap-2">
          <span className="whitespace-nowrap text-[18px] font-medium tabular-nums">{speed === null ? "—" : `${speed.toFixed(2)} m/s`}</span>
          <Sparkline values={history.speed} width={100} height={30} className="min-w-0 shrink" />
        </div>
      </MetricCard>
    </div>
  );
}
