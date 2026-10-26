import { Grid3x3 } from "lucide-react";
import { NavigationControls } from "@/components/dashboard/NavigationControls";
import { RVizMapPanel } from "@/components/dashboard/RVizMapPanel";
import { Panel } from "@/components/ui/panel";
import { useSettings } from "@/data/settings";
import { useDashboard } from "@/data/store";
import { DemoBadge } from "@/components/dashboard/DemoBadge";

function MapInfo() {
  const map = useDashboard((s) => s.map);
  const mode = useDashboard((s) => s.mode);
  const global = useDashboard((s) => s.globalPath.length);
  const local = useDashboard((s) => s.localPath.length);
  const settings = useSettings();
  const rows: [string, string][] = map
    ? [
        ["Source", mode === "demo" ? "Demo map (generated)" : settings.topics.map],
        ["Frame", map.frameId],
        ["Size", `${map.width} × ${map.height} cells`],
        ["Extent", `${(map.width * map.resolution).toFixed(2)} × ${(map.height * map.resolution).toFixed(2)} m`],
        ["Resolution", `${map.resolution.toFixed(3)} m/cell`],
        ["Origin", `(${map.originX.toFixed(2)}, ${map.originY.toFixed(2)})`],
        ["Updates received", String(map.revision)],
        ["Global plan", global ? `${global} poses` : "—"],
        ["Local plan", local ? `${local} poses` : "—"],
      ]
    : [];
  return (
    <Panel icon={<Grid3x3 />} title="Map Info" actions={<DemoBadge />} bodyClassName="px-4 py-3">
      {map ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-fg-muted">{k}</dt>
              <dd className="text-right tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="py-4 text-center text-[13px] text-fg-muted">No map received yet.</p>
      )}
    </Panel>
  );
}

export function MapPage() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:h-full xl:min-h-[700px] xl:grid-cols-[minmax(0,1fr)_346px]">
      <RVizMapPanel className="h-[560px] xl:h-auto" title="Map & RViz" />
      <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 md:grid-cols-2 xl:flex xl:flex-col">
        <NavigationControls />
        <MapInfo />
      </aside>
    </div>
  );
}
