import { useDashboard } from "@/data/store";
import { cn } from "@/lib/utils";

/** Marks panels whose values come from the Demo Mode simulator rather than a robot. */
export function DemoBadge({ className }: { className?: string }) {
  const mode = useDashboard((s) => s.mode);
  if (mode !== "demo") return null;
  return (
    <span
      title="Simulated data generated in the browser (Demo Mode). Switch to Live mode in Settings to use ROS 2."
      className={cn(
        "inline-flex h-5 items-center rounded-[4px] border border-warn/40 bg-warn-soft px-1.5 text-[10px] font-semibold uppercase tracking-wider text-warn",
        className,
      )}
    >
      Demo
    </span>
  );
}
