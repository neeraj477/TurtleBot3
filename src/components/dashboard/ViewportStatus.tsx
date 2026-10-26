import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import { controller } from "@/data/controller";
import { useSettings } from "@/data/settings";
import { useDashboard } from "@/data/store";
import { Button } from "@/components/ui/button";

/** Overlay explaining why a map viewport is empty (connecting, disconnected, waiting for /map). */
export function ViewportStatus({ compact = false }: { compact?: boolean }) {
  const connection = useDashboard((s) => s.connection);
  const hasMap = useDashboard((s) => s.map !== null || s.world !== null);
  const settings = useSettings();

  let icon = <Loader2 className="size-5 animate-spin text-fg-muted" />;
  let title: string;
  let detail: string | null = null;
  let retry = false;

  if (connection.status === "connecting" || connection.status === "idle") {
    title = "Connecting to rosbridge…";
    detail = settings.rosbridgeUrl;
  } else if (connection.status === "error" || connection.status === "disconnected") {
    icon = <WifiOff className="size-5 text-err-fg" />;
    title = "ROS 2 not connected";
    detail = `${connection.error ?? "Connection failed"}${connection.retryInSec !== null ? ` — retrying in ${connection.retryInSec}s` : ""}`;
    retry = true;
  } else if (!hasMap) {
    title = `Waiting for map on ${settings.topics.map}`;
    detail = "Start map_server (Nav2 bringup) or SLAM to publish an occupancy grid.";
  } else {
    return null;
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b1630]/70 p-4 text-center">
      <div className={compact ? "max-w-[200px]" : "max-w-[360px]"}>
        <div className="mb-2 flex justify-center">{icon}</div>
        <p className="text-[13px] font-medium text-fg">{title}</p>
        {detail && <p className="mt-1 break-words text-[12px] text-fg-muted">{detail}</p>}
        {retry && (
          <Button size="sm" className="mt-3" onClick={() => controller.refresh()}>
            <RefreshCw className="size-3.5" /> Retry now
          </Button>
        )}
      </div>
    </div>
  );
}
