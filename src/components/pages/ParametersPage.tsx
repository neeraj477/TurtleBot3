import { useEffect, useState } from "react";
import { CircleCheck, CircleX, RotateCcw, Save, SlidersHorizontal, Waypoints } from "lucide-react";
import { DEFAULT_SETTINGS, settingsStore, useSettings, type DashboardSettings, type TopicSettings } from "@/data/settings";
import { useDashboard } from "@/data/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

const TOPIC_LABELS: Record<keyof TopicSettings, string> = {
  map: "Occupancy grid",
  amclPose: "AMCL pose",
  odom: "Odometry",
  globalPlan: "Global plan",
  localPlan: "Local plan",
  battery: "Battery state",
  rosout: "Log output",
  clock: "Simulation clock",
  cmdVel: "Velocity command (Stop)",
  goalPose: "Goal pose (topic fallback)",
  initialPose: "Initial pose",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-fg-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  );
}

const selectClass = "h-9 w-full rounded-[5px] border border-line-strong bg-surface-2 px-3 text-[14px] text-fg outline-none focus:border-primary";

export function ParametersPage() {
  const settings = useSettings();
  const graph = useDashboard((s) => s.graph);
  const mode = useDashboard((s) => s.mode);
  const [draft, setDraft] = useState<DashboardSettings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const topicsValid = Object.values(draft.topics).every((t) => /^\/[A-Za-z0-9_/~]+$/.test(t));
  const save = () => {
    settingsStore.set(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Panel icon={<Waypoints />} title="ROS Topics" bodyClassName="p-4">
        <p className="mb-4 text-[13px] text-fg-muted">
          Topic names the Live mode subscribes to. When rosapi is available, each is checked against the ROS graph.
          {mode === "demo" && " (Graph checks run in Live mode only.)"}
        </p>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          {(Object.keys(TOPIC_LABELS) as (keyof TopicSettings)[]).map((key) => {
            const name = draft.topics[key];
            const type = graph?.topics[name];
            return (
              <Field key={key} label={TOPIC_LABELS[key]}>
                <div className="relative">
                  <Input
                    value={name}
                    onChange={(e) => setDraft({ ...draft, topics: { ...draft.topics, [key]: e.target.value } })}
                    aria-invalid={!/^\/[A-Za-z0-9_/~]+$/.test(name)}
                    className="pr-9 font-mono text-[13px]"
                  />
                  {graph && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2" title={type ? `Found: ${type}` : "Not in the ROS graph"}>
                      {type ? <CircleCheck className="size-4 text-ok-fg" /> : <CircleX className="size-4 text-fg-subtle" />}
                    </span>
                  )}
                </div>
              </Field>
            );
          })}
        </div>
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel icon={<SlidersHorizontal />} title="Connection & Navigation" bodyClassName="space-y-3 p-4">
          <Field label="Data source">
            <select className={selectClass} value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value as DashboardSettings["mode"] })}>
              <option value="demo">Demo Mode (simulated)</option>
              <option value="live">Live (rosbridge)</option>
            </select>
          </Field>
          <Field label="rosbridge URL">
            <Input value={draft.rosbridgeUrl} onChange={(e) => setDraft({ ...draft, rosbridgeUrl: e.target.value })} className="font-mono text-[13px]" />
          </Field>
          <Field label="NavigateToPose action" hint="nav2_msgs/action/NavigateToPose">
            <Input value={draft.navigateAction} onChange={(e) => setDraft({ ...draft, navigateAction: e.target.value })} className="font-mono text-[13px]" />
          </Field>
          <Field label="Goal transport" hint="Auto uses rosbridge action goals when supported, otherwise publishes to the goal pose topic.">
            <select
              className={selectClass}
              value={draft.goalTransport}
              onChange={(e) => setDraft({ ...draft, goalTransport: e.target.value as DashboardSettings["goalTransport"] })}
            >
              <option value="auto">Auto</option>
              <option value="action">Action only (send_action_goal)</option>
              <option value="topic">Topic only (goal_pose)</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Map frame">
              <Input value={draft.mapFrame} onChange={(e) => setDraft({ ...draft, mapFrame: e.target.value })} className="font-mono text-[13px]" />
            </Field>
            <Field label="cmd_vel type">
              <select
                className={selectClass}
                value={draft.cmdVelType}
                onChange={(e) => setDraft({ ...draft, cmdVelType: e.target.value as DashboardSettings["cmdVelType"] })}
              >
                <option value="geometry_msgs/msg/Twist">Twist</option>
                <option value="geometry_msgs/msg/TwistStamped">TwistStamped</option>
              </select>
            </Field>
          </div>
          <Field label="Robot label (sidebar)">
            <Input value={draft.robotModel} onChange={(e) => setDraft({ ...draft, robotModel: e.target.value })} />
          </Field>
        </Panel>
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={() => setDraft(DEFAULT_SETTINGS)}>
            <RotateCcw className="size-3.5" /> Defaults
          </Button>
          <Button size="sm" onClick={() => setDraft(settings)} disabled={!dirty}>
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={save} disabled={!dirty || !topicsValid} className={cn(saved && "bg-ok")}>
            <Save className="size-3.5" /> {saved ? "Saved" : "Save & apply"}
          </Button>
        </div>
        {!topicsValid && <p className="text-right text-[12px] text-err-fg">Topic names must start with “/”.</p>}
      </div>
    </div>
  );
}
