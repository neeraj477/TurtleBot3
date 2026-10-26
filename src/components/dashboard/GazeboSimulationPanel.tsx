import { useEffect, useRef, useState } from "react";
import { Box, Camera, ChevronDown, Maximize, ScanSearch } from "lucide-react";
import { dashboardStore, uiStore, useDashboard, useUi } from "@/data/store";
import { isGoalActive } from "@/data/telemetry";
import type { DashboardState } from "@/data/types";
import { cn } from "@/lib/utils";
import { DemoBadge } from "./DemoBadge";
import { MapLegend } from "./MapLegend";
import { ViewportStatus } from "./ViewportStatus";
import { setDraftFromMap } from "./goalDraft";
import { SimulationScene, type AxisProjection, type ViewMode } from "./simulationScene";

function visibleGoal(s: DashboardState) {
  const st = s.nav.state;
  return isGoalActive(st) || st === "succeeded" ? s.nav.goal : null;
}

function AxisGizmo({ axes }: { axes: AxisProjection | null }) {
  const c = 30;
  const len = 24;
  const a = axes ?? { x: [0.7, -0.3], y: [0.25, 0.35], z: [0, 1] };
  const items: { key: string; v: [number, number]; color: string }[] = [
    { key: "Z", v: a.z, color: "#3b82f6" },
    { key: "Y", v: a.y, color: "#22c55e" },
    { key: "X", v: a.x, color: "#ef4444" },
  ];
  return (
    <svg width="60" height="70" viewBox="0 0 60 64" aria-label="Camera axes">
      {items.map(({ key, v, color }) => {
        const x2 = c + v[0] * len;
        const y2 = 34 - v[1] * len;
        return (
          <g key={key}>
            <line x1={c} y1={34} x2={x2} y2={y2} stroke={color} strokeWidth="2" strokeLinecap="round" />
            <text x={c + v[0] * (len + 8)} y={34 - v[1] * (len + 8) + 4} fill={color} fontSize="10" fontWeight="600" textAnchor="middle">
              {key}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface GazeboSimulationPanelProps {
  className?: string;
}

/**
 * 3D view of the robot's world. Demo Mode renders the simulated warehouse; Live mode
 * renders the real occupancy grid extruded in 3D, with live robot pose, plans and goal.
 */
export function GazeboSimulationPanel({ className }: GazeboSimulationPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<SimulationScene | null>(null);
  const [axes, setAxes] = useState<AxisProjection | null>(null);
  const [view, setView] = useState<ViewMode>("3d");
  const pickMode = useUi((u) => u.pickMode);
  const mode = useDashboard((s) => s.mode);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let scene: SimulationScene;
    try {
      scene = new SimulationScene(el);
    } catch (err) {
      el.innerHTML = `<p style="padding:24px;color:#f87171;font-size:13px">WebGL is unavailable: ${(err as Error).message}</p>`;
      return;
    }
    sceneRef.current = scene;
    scene.onAxes = setAxes;
    scene.onGroundClick = (p) => setDraftFromMap(p);

    let prev: Partial<DashboardState> & { goal?: unknown; preview?: unknown; mapRev?: number } = {};
    let lastLocal = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;

    const sync = () => {
      const s = dashboardStore.get();
      const ui = uiStore.get();
      if (s.world !== prev.world || s.map?.revision !== prev.mapRev) {
        if (s.world) scene.setWorld(s.world);
        else if (s.map) scene.setMap(s.map);
        else scene.clear();
      }
      if (s.robot.pose !== prev.robot?.pose) scene.setRobot(s.robot.pose);
      const goal = visibleGoal(s);
      if (goal !== prev.goal) scene.setGoal(goal);
      if (ui.preview !== prev.preview) scene.setPreview(ui.preview);
      if (s.globalPath !== prev.globalPath) scene.setGlobalPath(s.globalPath);
      if (s.localPath !== prev.localPath) {
        // The local plan updates at controller rate; rebuild its mesh at most 10x per second.
        const now = performance.now();
        if (now - lastLocal >= 100) {
          lastLocal = now;
          scene.setLocalPath(s.localPath);
        } else if (!trailing) {
          trailing = setTimeout(() => {
            trailing = null;
            lastLocal = performance.now();
            scene.setLocalPath(dashboardStore.get().localPath);
          }, 100);
        }
      }
      prev = { world: s.world, mapRev: s.map?.revision, robot: s.robot, goal, preview: ui.preview, globalPath: s.globalPath, localPath: s.localPath };
    };
    sync();
    const un1 = dashboardStore.subscribe(sync);
    const un2 = uiStore.subscribe(sync);
    return () => {
      un1();
      un2();
      if (trailing) clearTimeout(trailing);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.pickEnabled = pickMode === "map";
  }, [pickMode]);

  const changeView = (v: ViewMode) => {
    setView(v);
    sceneRef.current?.setView(v);
  };

  const screenshot = () => {
    const url = sceneRef.current?.screenshot();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `simulation-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    a.click();
  };

  const fullscreen = () => {
    const el = panelRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const ctrlBtn = "flex size-9 items-center justify-center rounded-[5px] border border-line-strong bg-[#0d1a33] text-fg hover:bg-surface-3";

  return (
    <section ref={panelRef} className={cn("panel relative flex min-h-[320px] flex-col overflow-hidden", className)} aria-label="Gazebo Simulation">
      <header className="flex h-[46px] shrink-0 items-stretch">
        <div className="flex items-center gap-3 rounded-br-[6px] border-r border-b border-line bg-[#0c1832] px-4">
          <Box className="size-[21px]" strokeWidth={2} />
          <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Gazebo Simulation</h2>
          <DemoBadge />
        </div>
        <span className="ml-3 hidden self-center text-[11px] text-fg-subtle lg:inline">
          {mode === "demo" ? "Simulated warehouse (Demo Mode)" : "3D view of live /map, pose and plans"}
        </span>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className={cn("absolute inset-0", pickMode === "map" ? "cursor-crosshair" : "cursor-grab")}
          title={pickMode === "map" ? "Click to set the goal position · drag to orbit" : "Drag to orbit · scroll to zoom"}
        />
        <ViewportStatus />

        <div className="pointer-events-none absolute right-2 top-[-38px] z-20 rounded-[5px] border border-line bg-[#0b1630]/95 px-0.5">
          <AxisGizmo axes={axes} />
        </div>

        <MapLegend variant="gazebo" className="absolute bottom-2.5 left-2.5 z-20 hidden sm:flex" />

        <div className="absolute bottom-2.5 right-3 z-20 flex items-center gap-2 rounded-[6px] border border-line-strong bg-[#0b1630]/95 p-1.5">
          <button className={ctrlBtn} onClick={screenshot} title="Save screenshot" aria-label="Save screenshot">
            <Camera className="size-4" />
          </button>
          <button className={ctrlBtn} onClick={() => sceneRef.current?.resetView()} title="Reset camera" aria-label="Reset camera">
            <ScanSearch className="size-4" />
          </button>
          <button className={ctrlBtn} onClick={fullscreen} title="Toggle fullscreen" aria-label="Toggle fullscreen">
            <Maximize className="size-4" />
          </button>
          <label className="relative">
            <span className="sr-only">Camera view</span>
            <select
              value={view}
              onChange={(e) => changeView(e.target.value as ViewMode)}
              className="h-9 w-[104px] appearance-none rounded-[5px] border border-line-strong bg-[#0d1a33] pl-3 pr-7 text-[12px] text-fg outline-none hover:bg-surface-3 focus:border-primary"
            >
              <option value="3d">3D View</option>
              <option value="top">Top View</option>
              <option value="follow">Follow Robot</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" />
          </label>
        </div>
      </div>
    </section>
  );
}
