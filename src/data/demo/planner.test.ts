import { describe, expect, it } from "vitest";
import { buildDemoMap, DEMO_FIRST_GOAL, DEMO_START } from "./world";
import { buildCostmap, isFree, planPath } from "./planner";

describe("demo planner", () => {
  const cm = buildCostmap(buildDemoMap());

  it("finds a collision-free path from the demo start to the first goal", () => {
    const path = planPath(cm, DEMO_START, DEMO_FIRST_GOAL);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(10);
    for (const p of path!.slice(1, -1)) expect(isFree(cm, p)).toBe(true);
    const end = path![path!.length - 1];
    expect(end.x).toBeCloseTo(DEMO_FIRST_GOAL.x, 5);
    expect(end.y).toBeCloseTo(DEMO_FIRST_GOAL.y, 5);
  });

  it("rejects goals inside obstacles or outside the map", () => {
    expect(planPath(cm, DEMO_START, { x: 2.6, y: 3.35 })).toBeNull();
    expect(planPath(cm, DEMO_START, { x: 50, y: 50 })).toBeNull();
  });
});
