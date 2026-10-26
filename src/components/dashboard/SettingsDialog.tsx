import { useEffect, useState } from "react";
import { controller } from "@/data/controller";
import { settingsStore, useSettings } from "@/data/settings";
import { useDashboard } from "@/data/store";
import type { DataMode } from "@/data/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenParameters: () => void;
}

function validWsUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "ws:" || u.protocol === "wss:";
  } catch {
    return false;
  }
}

export function SettingsDialog({ open, onOpenChange, onOpenParameters }: SettingsDialogProps) {
  const settings = useSettings();
  const connection = useDashboard((s) => s.connection);
  const [mode, setMode] = useState<DataMode>(settings.mode);
  const [url, setUrl] = useState(settings.rosbridgeUrl);

  useEffect(() => {
    if (open) {
      setMode(settings.mode);
      setUrl(settings.rosbridgeUrl);
    }
  }, [open, settings.mode, settings.rosbridgeUrl]);

  const urlOk = validWsUrl(url);
  const apply = () => {
    if (mode === "live" && !urlOk) return;
    const changed = mode !== settings.mode || url !== settings.rosbridgeUrl;
    settingsStore.set({ mode, rosbridgeUrl: url });
    if (!changed) controller.restart();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Settings" description="Choose the data source for the dashboard.">
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-[12px] text-fg-muted">Data source</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["demo", "Demo Mode", "Simulated in the browser. No ROS required."],
                ["live", "Live (ROS 2)", "Connect to rosbridge_server and Nav2."],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={cn(
                  "rounded-[6px] border p-3 text-left transition-colors",
                  mode === value ? "border-primary bg-primary-soft" : "border-line-strong bg-surface-2 hover:bg-surface-3",
                )}
              >
                <span className="block text-[14px] font-medium">{label}</span>
                <span className="mt-1 block text-[12px] text-fg-muted">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1.5 block text-[12px] text-fg-muted">rosbridge WebSocket URL</span>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} disabled={mode !== "live"} aria-invalid={mode === "live" && !urlOk} />
          {mode === "live" && !urlOk && <span className="mt-1 block text-[12px] text-err-fg">Enter a ws:// or wss:// URL.</span>}
        </label>

        {settings.mode === "live" && (
          <p className="text-[12px] text-fg-muted">
            Current connection: <span className="text-fg">{connection.status}</span>
            {connection.error ? ` — ${connection.error}` : ""}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onOpenParameters();
            }}
          >
            Topic names & advanced…
          </Button>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={apply} disabled={mode === "live" && !urlOk}>
              {mode === "live" ? (settings.mode === "live" && url === settings.rosbridgeUrl ? "Reconnect" : "Connect") : "Use Demo Mode"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
