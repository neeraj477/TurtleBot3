import { useEffect, useRef, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { dashboardStore, uiStore, useUi } from "@/data/store";
import { isGoalActive } from "@/data/telemetry";
import type { OccupancyGrid } from "@/data/types";
import type { Point2D, Pose2D } from "@/lib/geometry";
import { cn } from "@/lib/utils";
import { DemoBadge } from "./DemoBadge";
import { MapLegend } from "./MapLegend";
import { ViewportStatus } from "./ViewportStatus";
import { setDraftFromMap } from "./goalDraft";

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface View {
  scale: number;
  offX: number;
  offY: number;
  bounds: Bounds;
}

/** Pre-renders the occupancy grid into an image (1 px per cell) and finds the explored area. */
function rasterize(grid: OccupancyGrid): { image: HTMLCanvasElement; bounds: Bounds } {
  const { width, height, data, resolution, originX, originY } = grid;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  let minI = width;
  let minJ = height;
  let maxI = -1;
  let maxJ = -1;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const v = data[j * width + i];
      const o = ((height - 1 - j) * width + i) * 4;
      if (v < 0) continue; // unknown: transparent, so the panel grid shows through
      if (i < minI) minI = i;
      if (j < minJ) minJ = j;
      if (i > maxI) maxI = i;
      if (j > maxJ) maxJ = j;
      if (v >= 65) {
        const n = ((i * 7919 + j * 104729) % 23) - 11;
        img.data[o] = 150 + n;
        img.data[o + 1] = 158 + n;
        img.data[o + 2] = 170 + n;
        img.data[o + 3] = 255;
      } else {
        const t = v / 100;
        img.data[o] = 14 + t * 60;
        img.data[o + 1] = 25 + t * 60;
        img.data[o + 2] = 46 + t * 60;
        img.data[o + 3] = 120;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const bounds =
    maxI < 0
      ? { minX: originX, minY: originY, maxX: originX + width * resolution, maxY: originY + height * resolution }
      : {
          minX: originX + minI * resolution - 0.15,
          minY: originY + minJ * resolution - 0.15,
          maxX: originX + (maxI + 1) * resolution + 0.15,
          maxY: originY + (maxJ + 1) * resolution + 0.15,
        };
  return { image: canvas, bounds };
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-3, -6, -8, -10, -8, -16);
  ctx.arc(0, -16, 8, Math.PI, 0);
  ctx.bezierCurveTo(8, -10, 3, -6, 0, 0);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0, -16, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPoseMarker(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, theta: number, color: string, dashed = false) {
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color;
  if (dashed) ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(theta) * 7, p.y - Math.sin(theta) * 7);
  ctx.lineTo(p.x + Math.cos(theta) * 16, p.y - Math.sin(theta) * 16);
  ctx.stroke();
  ctx.restore();
}

interface RVizMapPanelProps {
  className?: string;
  title?: string;
}

export function RVizMapPanel({ className, title = "RViz Visualization" }: RVizMapPanelProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const dragRef = useRef<{ start: Point2D; yaw: number | null } | null>(null);
  const redrawRef = useRef<() => void>(() => {});
  const [hover, setHover] = useState<Point2D | null>(null);
  const pickMode = useUi((u) => u.pickMode);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d")!;
    let raster: { rev: number; map: OccupancyGrid; image: HTMLCanvasElement; bounds: Bounds } | null = null;
    let dirty = true;
    let frame = 0;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      if (!dirty) return;
      dirty = false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const s = dashboardStore.get();
      const ui = uiStore.get();
      if (!s.map) {
        viewRef.current = null;
        return;
      }
      if (!raster || raster.map !== s.map) raster = { rev: s.map.revision, map: s.map, ...rasterize(s.map) };
      const b = raster.bounds;
      const pad = 12;
      const scale = Math.min((w - 2 * pad) / (b.maxX - b.minX), (h - 2 * pad) / (b.maxY - b.minY));
      const offX = (w - (b.maxX - b.minX) * scale) / 2;
      const offY = (h - (b.maxY - b.minY) * scale) / 2;
      viewRef.current = { scale, offX, offY, bounds: b };
      const toPx = (p: Point2D) => ({ x: offX + (p.x - b.minX) * scale, y: offY + (b.maxY - p.y) * scale });

      const m = s.map;
      const tl = toPx({ x: m.originX, y: m.originY + m.height * m.resolution });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(raster.image, tl.x, tl.y, m.width * m.resolution * scale, m.height * m.resolution * scale);

      const stroke = (path: Point2D[], color: string, width: number) => {
        if (path.length < 2) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        path.forEach((p, i) => {
          const q = toPx(p);
          if (i === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        });
        ctx.stroke();
        ctx.restore();
      };
      stroke(s.globalPath, "#2f7ff6", 3);
      stroke(s.localPath, "#4fb3ff", 4.5);

      const goal = isGoalActive(s.nav.state) || s.nav.state === "succeeded" ? s.nav.goal : null;
      if (goal) {
        const g = toPx(goal);
        drawPoseMarker(ctx, g, goal.theta, "#22c55e");
        drawPin(ctx, g.x, g.y - 4, "#ef4444");
      }
      const preview: Pose2D | null = dragRef.current
        ? { ...dragRef.current.start, theta: dragRef.current.yaw ?? 0 }
        : ui.preview;
      if (preview) drawPoseMarker(ctx, toPx(preview), preview.theta, "#60a5fa", true);

      if (s.robot.pose) {
        const r = toPx(s.robot.pose);
        drawPoseMarker(ctx, r, s.robot.pose.theta, "#22c55e");
        ctx.fillStyle = "#e7edf8";
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    frame = requestAnimationFrame(draw);
    const markDirty = () => {
      dirty = true;
    };
    const un1 = dashboardStore.subscribe(markDirty);
    const un2 = uiStore.subscribe(markDirty);
    const ro = new ResizeObserver(markDirty);
    ro.observe(wrap);
    redrawRef.current = markDirty;
    return () => {
      cancelAnimationFrame(frame);
      un1();
      un2();
      ro.disconnect();
      redrawRef.current = () => {};
    };
  }, []);

  const toWorld = (e: React.PointerEvent): Point2D | null => {
    const v = viewRef.current;
    const canvas = canvasRef.current;
    if (!v || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    return { x: v.bounds.minX + (px - v.offX) / v.scale, y: v.bounds.maxY - (py - v.offY) / v.scale };
  };

  const requestRedraw = () => redrawRef.current();

  const onPointerDown = (e: React.PointerEvent) => {
    if (pickMode !== "map") return;
    const p = toWorld(e);
    if (!p) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { start: p, yaw: null };
    requestRedraw();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toWorld(e);
    setHover(p);
    const d = dragRef.current;
    if (d && p && Math.hypot(p.x - d.start.x, p.y - d.start.y) > 0.1) {
      d.yaw = Math.atan2(p.y - d.start.y, p.x - d.start.x);
      requestRedraw();
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d) setDraftFromMap(d.start, d.yaw ?? undefined);
  };

  return (
    <section className={cn("panel flex min-h-[320px] flex-col overflow-hidden", className)} aria-label={title}>
      <header className="flex h-[50px] shrink-0 items-center gap-3 px-4">
        <MapIcon className="size-[21px]" strokeWidth={2} />
        <h2 className="truncate text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
      </header>
      <div className="relative mx-[3px] mb-[3px] min-h-0 flex-1 overflow-hidden rounded-[5px] border border-line grid-bg">
        <div ref={wrapRef} className="absolute inset-0">
          <canvas
            ref={canvasRef}
            className={cn("block h-full w-full touch-none", pickMode === "map" ? "cursor-crosshair" : "cursor-default")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setHover(null)}
            aria-label="Occupancy grid map. In Click on Map mode, click to set a goal and drag to set its heading."
            role="img"
          />
        </div>
        <ViewportStatus compact />
        <DemoBadge className="absolute left-1.5 top-1.5 z-20" />
        {hover && (
          <div className="pointer-events-none absolute right-1.5 top-1.5 z-20 rounded-[4px] bg-[#0b1630]/90 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
            {hover.x.toFixed(2)}, {hover.y.toFixed(2)}
          </div>
        )}
        <MapLegend variant="rviz" className="absolute bottom-1.5 left-1.5 z-20 gap-[8px] px-2 py-2 text-[11.5px]" />
      </div>
    </section>
  );
}
