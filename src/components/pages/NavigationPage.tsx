import { Nav2HealthPanel } from "@/components/dashboard/Nav2HealthPanel";
import { NavigationControls } from "@/components/dashboard/NavigationControls";
import { NavigationMetricCards } from "@/components/dashboard/NavigationMetricCards";
import { RobotStatusCard } from "@/components/dashboard/RobotStatusCard";
import { RVizMapPanel } from "@/components/dashboard/RVizMapPanel";

export function NavigationPage() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:h-full xl:min-h-[760px] xl:grid-cols-[minmax(0,1fr)_346px]">
      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-rows-[minmax(0,1fr)_110px]">
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_346px]">
          <RVizMapPanel className="h-[520px] lg:h-auto" title="Navigation Map" />
          <Nav2HealthPanel className="self-start" />
        </div>
        <NavigationMetricCards />
      </div>
      <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 md:grid-cols-2 xl:flex xl:flex-col">
        <NavigationControls allowInitialPose />
        <RobotStatusCard />
      </aside>
    </div>
  );
}
