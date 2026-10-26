import { AlertTriangle, Check, CircleDashed, CircleHelp, CircleX, Layers, Loader2 } from "lucide-react";
import { useDashboard } from "@/data/store";
import type { ComponentState, HealthItem } from "@/data/types";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { DemoBadge } from "./DemoBadge";

const STATE_STYLE: Record<ComponentState, { text: string; className: string }> = {
  active: { text: "Active", className: "text-ok-fg" },
  inactive: { text: "Inactive", className: "text-warn" },
  unconfigured: { text: "Unconfigured", className: "text-warn" },
  transitioning: { text: "Transitioning", className: "text-warn" },
  finalized: { text: "Finalized", className: "text-err-fg" },
  unavailable: { text: "Unavailable", className: "text-err-fg" },
  checking: { text: "Checking…", className: "text-fg-muted" },
  unknown: { text: "Unknown", className: "text-fg-muted" },
};

function StateIcon({ state }: { state: ComponentState }) {
  // A green check is shown only for a component confirmed active.
  if (state === "active")
    return (
      <span className="flex size-[26px] items-center justify-center rounded-full bg-ok">
        <Check className="size-[15px] text-[#0b1630]" strokeWidth={3.5} />
      </span>
    );
  if (state === "unavailable" || state === "finalized") return <CircleX className="size-[26px] text-err-fg" />;
  if (state === "checking") return <Loader2 className="size-[26px] animate-spin text-fg-muted" />;
  if (state === "unknown") return <CircleHelp className="size-[26px] text-fg-subtle" />;
  if (state === "transitioning") return <CircleDashed className="size-[26px] text-warn" />;
  return <AlertTriangle className="size-[24px] text-warn" />;
}

function Row({ item }: { item: HealthItem }) {
  const st = STATE_STYLE[item.state];
  const label = item.detail ? `${item.label.replace(/ \(.*\)$/, "")} (${item.detail})` : item.label;
  return (
    <li className="flex h-[37px] items-center gap-3" title={item.note ?? undefined}>
      <StateIcon state={item.state} />
      <span className="min-w-0 flex-1 truncate text-[14px]">{label}</span>
      <span className={`text-[14px] ${st.className}`}>{st.text}</span>
    </li>
  );
}

export function Nav2HealthPanel({ className }: { className?: string }) {
  const health = useDashboard((s) => s.health);
  const connection = useDashboard((s) => s.connection.status);

  const active = health.filter((h) => h.state === "active").length;
  let summary: { text: string; tone: BadgeProps["tone"] };
  if (connection !== "connected") summary = { text: "Offline", tone: "err" };
  else if (health.length === 0 || health.every((h) => h.state === "checking" || h.state === "unknown"))
    summary = { text: "Checking…", tone: "muted" };
  else if (active === health.length) summary = { text: "All Systems Online", tone: "ok" };
  else if (active === 0) summary = { text: "Stack Down", tone: "err" };
  else summary = { text: `${active}/${health.length} Active`, tone: "warn" };

  return (
    <Panel
      icon={<Layers strokeWidth={2.2} />}
      title="Nav2 Stack"
      className={className}
      bodyClassName="px-4 pb-3 pt-2.5"
      actions={
        <>
          <DemoBadge />
          <Badge tone={summary.tone} size="sm" className="h-[26px] px-2 text-[12px]">
            {summary.text}
          </Badge>
        </>
      }
    >
      {health.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-muted">No component status yet.</p>
      ) : (
        <ul className="flex flex-col">
          {health.map((h) => (
            <Row key={h.id} item={h} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
