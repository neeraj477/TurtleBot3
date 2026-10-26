import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface MapLegendProps {
  variant: "gazebo" | "rviz";
  className?: string;
}

/** Legend overlay used by the simulation and RViz panels. */
export function MapLegend({ variant, className }: MapLegendProps) {
  const rows =
    variant === "gazebo"
      ? [
          { key: "robot", label: "Robot (TurtleBot3)" },
          { key: "global", label: "Planned Path" },
          { key: "local", label: "Local Path" },
          { key: "goal", label: "Goal" },
          { key: "obstacle", label: "Obstacles" },
        ]
      : [
          { key: "robot", label: "Robot Pose" },
          { key: "global", label: "Global Path" },
          { key: "local", label: "Local Path" },
          { key: "goal", label: "Goal" },
          { key: "obstacle", label: "Obstacles" },
        ];
  return (
    <ul
      className={cn(
        "pointer-events-none flex flex-col gap-[7px] rounded-[5px] border border-line-strong/80 bg-[#0b1630]/92 px-3 py-2.5 text-[12px] text-fg",
        className,
      )}
    >
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2.5 leading-none">
          <span className="flex w-4 justify-center">
            {r.key === "robot" && <span className="size-3 rounded-full border-[3px] border-ok bg-[#0b1630]" />}
            {r.key === "global" && <span className="h-[5px] w-4 rounded-full bg-path" />}
            {r.key === "local" && <span className="h-[5px] w-4 rounded-full bg-path-local" />}
            {r.key === "goal" &&
              (variant === "gazebo" ? (
                <MapPin className="size-4 fill-ok text-ok [&>circle]:fill-white [&>circle]:stroke-white" strokeWidth={1.5} />
              ) : (
                <MapPin className="size-4 fill-err text-err [&>circle]:fill-white [&>circle]:stroke-white" strokeWidth={1.5} />
              ))}
            {r.key === "obstacle" && <span className="size-3.5 rounded-[3px] bg-[#c3c8d1]" />}
          </span>
          {r.label}
        </li>
      ))}
    </ul>
  );
}
