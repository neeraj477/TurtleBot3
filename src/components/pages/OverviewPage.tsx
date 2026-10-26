import { GazeboSimulationPanel } from "@/components/dashboard/GazeboSimulationPanel";
import { LogsConsole } from "@/components/dashboard/LogsConsole";
import { Nav2HealthPanel } from "@/components/dashboard/Nav2HealthPanel";
import { NavigationControls } from "@/components/dashboard/NavigationControls";
import { NavigationMetricCards } from "@/components/dashboard/NavigationMetricCards";
import { RobotStatusCard } from "@/components/dashboard/RobotStatusCard";
import { RVizMapPanel } from "@/components/dashboard/RVizMapPanel";

/** The reference layout: simulation + RViz on top, console and metrics below, controls on the right. */
export function OverviewPage() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:h-full xl:min-h-[880px] xl:grid-cols-[minmax(0,1fr)_346px] xl:gap-[17px]">
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-rows-[minmax(360px,1fr)_248px_110px]">
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1fr)_252px]">
          <GazeboSimulationPanel className="h-[440px] md:h-auto" />
          <RVizMapPanel className="h-[440px] md:h-auto" />
        </div>
        <LogsConsole className="h-[260px] xl:h-auto" />
        <NavigationMetricCards />
      </div>
      <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 md:grid-cols-2 xl:flex xl:flex-col xl:gap-[15px]" aria-label="Robot controls and status">
        <NavigationControls />
        <RobotStatusCard />
        <Nav2HealthPanel className="md:col-span-2 xl:col-span-1" />
      </aside>
    </div>
  );
}
