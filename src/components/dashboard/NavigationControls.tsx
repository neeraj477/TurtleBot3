import { useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, MousePointer2, Send, Square } from "lucide-react";
import { controller } from "@/data/controller";
import { uiStore, useDashboard, useUi } from "@/data/store";
import { isGoalActive } from "@/data/telemetry";
import type { GoalDraft } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { validateDraft } from "./goalDraft";

interface NavigationControlsProps {
  className?: string;
  /** Shows the Goal / Initial Pose switch (Navigation page). */
  allowInitialPose?: boolean;
}

export function NavigationControls({ className, allowInitialPose = false }: NavigationControlsProps) {
  const ui = useUi((u) => u);
  const map = useDashboard((s) => s.map);
  const caps = useDashboard((s) => s.capabilities);
  const navState = useDashboard((s) => s.nav.state);
  const [busy, setBusy] = useState<"send" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const xRef = useRef<HTMLInputElement>(null);

  const validation = validateDraft(ui.draft, map);
  const target = allowInitialPose ? ui.pickTarget : "goal";
  const active = isGoalActive(navState);
  const canSend = target === "goal" ? caps.sendGoal : caps.setInitialPose;
  const sendReason = target === "goal" ? caps.reasons.sendGoal : caps.reasons.setInitialPose;

  const setField = (key: keyof GoalDraft, value: string) => {
    setTouched(true);
    setError(null);
    const draft = { ...uiStore.get().draft, [key]: value };
    const v = validateDraft(draft, map);
    uiStore.set({ draft, preview: v.pose });
  };

  const submit = async () => {
    setTouched(true);
    if (!validation.pose) {
      setError(Object.values(validation.errors)[0] ?? "Invalid goal");
      return;
    }
    setBusy("send");
    setError(null);
    try {
      if (target === "goal") await controller.sendGoal(validation.pose);
      else await controller.setInitialPose(validation.pose);
      uiStore.set({ preview: null });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    setError(null);
    try {
      await controller.cancelGoal();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const fields: { key: keyof GoalDraft; label: string }[] = [
    { key: "x", label: "X (m)" },
    { key: "y", label: "Y (m)" },
    { key: "yaw", label: "Yaw (rad)" },
  ];

  return (
    <Panel icon={<MapPin strokeWidth={2.2} />} title="Navigation Controls" className={className} bodyClassName="px-4 pb-4 pt-3.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[16px] font-semibold">{target === "goal" ? "Set Goal" : "Set Initial Pose"}</h3>
          {allowInitialPose && (
            <div className="flex rounded-[5px] border border-line-strong p-0.5 text-[12px]" role="tablist" aria-label="Pose target">
              {(["goal", "initialPose"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={ui.pickTarget === t}
                  onClick={() => uiStore.set({ pickTarget: t })}
                  className={cn("rounded-[4px] px-2 py-1", ui.pickTarget === t ? "bg-primary-soft text-fg" : "text-fg-muted hover:text-fg")}
                >
                  {t === "goal" ? "Goal" : "Initial pose"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3" role="group" aria-label="Goal input method">
          <Button
            variant={ui.pickMode === "map" ? "primary" : "outline"}
            className="h-12 text-[14px] font-normal"
            aria-pressed={ui.pickMode === "map"}
            onClick={() => uiStore.set({ pickMode: "map" })}
            title="Click on the Gazebo or RViz view to fill X/Y; drag on the RViz map to set yaw"
          >
            <MousePointer2 className="size-[18px]" /> Click on Map
          </Button>
          <Button
            variant={ui.pickMode === "coordinates" ? "primary" : "outline"}
            className="h-12 px-2 text-[13px] font-normal"
            aria-pressed={ui.pickMode === "coordinates"}
            onClick={() => {
              uiStore.set({ pickMode: "coordinates" });
              xRef.current?.focus();
            }}
          >
            <Crosshair className="size-[19px]" /> Enter Coordinates
          </Button>
        </div>

        <div className="mt-[18px] grid grid-cols-3 gap-3">
          {fields.map((f) => {
            const err = touched ? validation.errors[f.key] : undefined;
            return (
              <label key={f.key} className="block">
                <span className="mb-[7px] block text-[12px] text-fg-muted">{f.label}</span>
                <Input
                  ref={f.key === "x" ? xRef : undefined}
                  inputMode="decimal"
                  value={ui.draft[f.key]}
                  placeholder={f.key === "yaw" ? "0.00" : "—"}
                  onChange={(e) => setField(f.key, e.target.value)}
                  aria-invalid={!!err}
                  title={err}
                />
              </label>
            );
          })}
        </div>

        {(error || (touched && Object.values(validation.errors)[0]) || validation.warning) && (
          <p role="alert" className={cn("mt-2 text-[12px]", error || Object.keys(validation.errors).length ? "text-err-fg" : "text-warn")}>
            {error ?? Object.values(validation.errors)[0] ?? validation.warning}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="flex-1 font-normal"
            disabled={!canSend || busy !== null}
            title={canSend ? undefined : sendReason}
          >
            {busy === "send" ? <Loader2 className="size-[18px] animate-spin" /> : <Send className="size-[18px]" />}
            {target === "goal" ? "Send Goal" : "Set Initial Pose"}
          </Button>
          {target === "goal" && active && (
            <Button
              variant="danger"
              size="lg"
              className="px-4 text-[14px] font-normal"
              onClick={() => void cancel()}
              disabled={!caps.cancelGoal || busy !== null}
              title={caps.cancelGoal ? "Cancel the active navigation goal" : caps.reasons.cancelGoal}
            >
              {busy === "cancel" ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-3.5 fill-current" />}
              Cancel
            </Button>
          )}
        </div>
        {!canSend && sendReason && <p className="mt-2 text-[12px] text-fg-subtle">{sendReason}</p>}
      </form>
    </Panel>
  );
}
