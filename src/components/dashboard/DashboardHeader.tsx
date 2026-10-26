import { useState } from "react";
import { Bot, Loader2, Menu, Pause, Play, Settings, Square } from "lucide-react";
import { controller } from "@/data/controller";
import { useDashboard } from "@/data/store";
import type { SimStatus } from "@/data/types";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const SIM_PILL: Record<SimStatus, { text: string; dot: string; className: string; title: string }> = {
  running: { text: "Running", dot: "bg-ok", className: "bg-ok-soft text-ok-fg", title: "Simulation clock is advancing" },
  paused: { text: "Paused", dot: "bg-warn", className: "bg-warn-soft text-warn", title: "Simulation paused" },
  stalled: { text: "Clock Stalled", dot: "bg-warn", className: "bg-warn-soft text-warn", title: "/clock has stopped advancing" },
  "no-clock": { text: "No Sim Clock", dot: "bg-fg-subtle", className: "bg-surface-3 text-fg-muted", title: "No /clock messages (real robot or Gazebo not running)" },
  unknown: { text: "Unknown", dot: "bg-fg-subtle", className: "bg-surface-3 text-fg-muted", title: "Simulation state unknown" },
};

interface DashboardHeaderProps {
  onOpenSettings: () => void;
  onToggleNav: () => void;
}

export function DashboardHeader({ onOpenSettings, onToggleNav }: DashboardHeaderProps) {
  const sim = useDashboard((s) => s.sim);
  const mode = useDashboard((s) => s.mode);
  const connection = useDashboard((s) => s.connection);
  const caps = useDashboard((s) => s.capabilities);
  const [busy, setBusy] = useState<"pause" | "stop" | null>(null);

  const offline = mode === "live" && connection.status !== "connected";
  const pill = offline
    ? {
        text: connection.status === "connecting" ? "Connecting" : "Disconnected",
        dot: connection.status === "connecting" ? "bg-warn" : "bg-err",
        className: connection.status === "connecting" ? "bg-warn-soft text-warn" : "bg-err-soft text-err-fg",
        title: connection.error ?? "Not connected to rosbridge",
      }
    : SIM_PILL[sim.status];
  const paused = sim.status === "paused";

  const run = async (kind: "pause" | "stop", fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch {
      // The controller already logs failures to the System log.
    } finally {
      setBusy(null);
    }
  };

  return (
    <header className="flex h-[84px] shrink-0 items-center gap-3 border-b border-line bg-chrome px-4 md:px-6">
      <button className="rounded p-1.5 text-fg-muted hover:bg-surface-3 lg:hidden" onClick={onToggleNav} aria-label="Toggle navigation">
        <Menu className="size-6" />
      </button>
      <Bot className="hidden size-[50px] shrink-0 text-[#e8eefc] sm:block" strokeWidth={1.7} aria-hidden />
      <div className="min-w-0 sm:ml-[18px]">
        <h1 className="truncate text-[20px] font-semibold tracking-[-0.015em] sm:text-[25px]">TurtleBot3 Navigation Demo</h1>
        <p className="mt-0.5 hidden whitespace-nowrap text-[14px] text-fg-muted sm:block">
          ROS 2 <span className="mx-2 text-fg-subtle">|</span> Gazebo <span className="mx-2 text-fg-subtle">|</span> Nav2
        </p>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3 xl:gap-[18px]">
        {mode === "demo" && (
          <span
            className="hidden h-7 items-center whitespace-nowrap rounded-full border border-warn/40 bg-warn-soft px-3 text-[11px] font-semibold uppercase tracking-wider text-warn xl:inline-flex"
            title="All data is simulated in the browser. Open Settings to connect to ROS 2."
          >
            Demo Mode · Simulated Data
          </span>
        )}
        <span className={cn("inline-flex h-9 items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium sm:px-4 sm:text-[14px]", pill.className)} title={pill.title} role="status" aria-label={pill.text}>
          <span className={cn("size-2.5 rounded-full", pill.dot)} />
          <span className="hidden sm:inline">{pill.text}</span>
        </span>
        <div className="hidden w-[100px] lg:block">
          <p className="text-[11px] text-fg-muted">Simulation Time</p>
          <p className="mt-1 text-[14px] tabular-nums">{formatClock(sim.time)}</p>
        </div>
        <Button
          className="w-11 px-0 lg:w-[98px] lg:px-4"
          aria-label={paused ? "Resume" : "Pause"}
          disabled={!caps.pauseSim || busy !== null}
          title={caps.pauseSim ? (paused ? "Resume physics" : "Pause physics") : caps.reasons.pauseSim}
          onClick={() => void run("pause", () => controller.setPaused(!paused))}
        >
          {busy === "pause" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : paused ? (
            <Play className="size-4 fill-current" />
          ) : (
            <Pause className="size-[18px] fill-current" />
          )}
          <span className="hidden lg:inline">{paused ? "Resume" : "Pause"}</span>
        </Button>
        <Button
          className="w-11 px-0 lg:w-[86px] lg:px-4"
          aria-label="Stop"
          disabled={!caps.stopRobot || busy !== null}
          title={caps.stopRobot ? "Cancel navigation and command zero velocity" : caps.reasons.stopRobot}
          onClick={() => void run("stop", () => controller.stopRobot())}
        >
          {busy === "stop" ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-[15px] fill-current" />}
          <span className="hidden lg:inline">Stop</span>
        </Button>
        <Button className="w-11 px-0 lg:w-[102px] lg:px-4" onClick={onOpenSettings} aria-label="Settings">
          <Settings className="size-[18px]" />
          <span className="hidden lg:inline">Settings</span>
        </Button>
      </div>
    </header>
  );
}
