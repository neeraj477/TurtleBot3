import { GazeboSimulationPanel } from "@/components/dashboard/GazeboSimulationPanel";
import { NavigationControls } from "@/components/dashboard/NavigationControls";
import { NavigationMetricCards } from "@/components/dashboard/NavigationMetricCards";
import { RobotStatusCard } from "@/components/dashboard/RobotStatusCard";

export function SimulationPage() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:h-full xl:min-h-[760px] xl:grid-cols-[minmax(0,1fr)_346px]">
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-rows-[minmax(0,1fr)_110px]">
        <GazeboSimulationPanel className="h-[520px] xl:h-auto" />
        <NavigationMetricCards />
      </div>
      <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 md:grid-cols-2 xl:flex xl:flex-col">
        <NavigationControls />
        <RobotStatusCard />
      </aside>
    </div>
  );
}
