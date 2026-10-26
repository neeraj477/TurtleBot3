import { normalizeAngle, type Point2D, type Pose2D } from "@/lib/geometry";
import { uiStore } from "@/data/store";
import type { GoalDraft, OccupancyGrid } from "@/data/types";

/** Fills the goal inputs from a point picked on a map view. */
export function setDraftFromMap(p: Point2D, yaw?: number): void {
  const ui = uiStore.get();
  const theta = normalizeAngle(yaw ?? (Number.parseFloat(ui.draft.yaw) || 0));
  uiStore.set({
    draft: { x: p.x.toFixed(2), y: p.y.toFixed(2), yaw: theta.toFixed(2) },
    preview: { x: p.x, y: p.y, theta },
  });
}

export interface DraftValidation {
  pose: Pose2D | null;
  errors: Partial<Record<keyof GoalDraft, string>>;
  warning: string | null;
}

function parse(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Validates the X/Y/Yaw inputs, optionally against the occupancy grid. */
export function validateDraft(draft: GoalDraft, map: OccupancyGrid | null): DraftValidation {
  const errors: DraftValidation["errors"] = {};
  const x = parse(draft.x);
  const y = parse(draft.y);
  const yaw = parse(draft.yaw);
  if (x === null) errors.x = "Enter a number";
  if (y === null) errors.y = "Enter a number";
  if (yaw === null) errors.yaw = "Enter a number";
  else if (Math.abs(yaw) > 2 * Math.PI) errors.yaw = "Use radians (−2π…2π)";
  if (x === null || y === null || yaw === null || Object.keys(errors).length) return { pose: null, errors, warning: null };

  let warning: string | null = null;
  if (map) {
    const i = Math.floor((x - map.originX) / map.resolution);
    const j = Math.floor((y - map.originY) / map.resolution);
    if (i < 0 || j < 0 || i >= map.width || j >= map.height) {
      return { pose: null, errors: { x: "Outside the map", y: "Outside the map" }, warning: null };
    }
    const v = map.data[j * map.width + i];
    if (v >= 65) return { pose: null, errors: { x: "Inside an obstacle", y: "Inside an obstacle" }, warning: null };
    if (v < 0) warning = "Goal is in unexplored space; Nav2 may reject it.";
  }
  return { pose: { x, y, theta: normalizeAngle(yaw) }, errors, warning };
}
