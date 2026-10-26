import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Check, ChevronDown, Copy, Search, SquareTerminal, WifiOff } from "lucide-react";
import { controller } from "@/data/controller";
import { useSettings } from "@/data/settings";
import { useDashboard } from "@/data/store";
import type { LogChannel, LogEntry, LogLevel } from "@/data/types";
import { formatTimeOfDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "./DemoBadge";

const TABS: { id: LogChannel; label: string }[] = [
  { id: "ros", label: "ROS 2 Logs" },
  { id: "nav2", label: "Nav2 Logs" },
  { id: "gazebo", label: "Gazebo Logs" },
  { id: "system", label: "System" },
];

const LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];

const LEVEL_CLASS: Record<LogLevel, string> = {
  DEBUG: "text-fg-subtle",
  INFO: "text-ok-fg",
  WARN: "text-warn",
  ERROR: "text-err-fg",
  FATAL: "text-err-fg font-semibold",
};

const VISIBLE_LIMIT = 500;

function formatLine(l: LogEntry) {
  return `[${formatTimeOfDay(l.time)}] [${l.level}] [${l.source}] ${l.message}`;
}

interface LogsConsoleProps {
  className?: string;
  /** Full variant (Logs page) adds text search and a source column. */
  variant?: "compact" | "full";
}

export function LogsConsole({ className, variant = "compact" }: LogsConsoleProps) {
  const logs = useDashboard((s) => s.logs);
  const connection = useDashboard((s) => s.connection);
  const mode = useDashboard((s) => s.mode);
  const settings = useSettings();
  const [tab, setTab] = useState<LogChannel>("ros");
  const [minLevel, setMinLevel] = useState<LogLevel>("DEBUG");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<"ok" | "err" | null>(null);
  const [stick, setStick] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const min = LEVELS.indexOf(minLevel);
    const q = query.trim().toLowerCase();
    const out = logs.filter(
      (l) =>
        (tab === "ros" ? l.channels.includes("ros") || l.channels.includes("nav2") || l.channels.includes("gazebo") : l.channels.includes(tab)) &&
        LEVELS.indexOf(l.level) >= min &&
        (!q || l.message.toLowerCase().includes(q) || l.source.toLowerCase().includes(q)),
    );
    return out.length > VISIBLE_LIMIT ? out.slice(out.length - VISIBLE_LIMIT) : out;
  }, [logs, tab, minLevel, query]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick) el.scrollTop = el.scrollHeight;
  }, [filtered, stick]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(filtered.map(formatLine).join("\n"));
      setCopied("ok");
    } catch {
      setCopied("err");
    }
    setTimeout(() => setCopied(null), 1500);
  };

  const clear = () => {
    if (tab === "ros") controller.clearLogs((c) => c.includes("ros"));
    else controller.clearLogs((c) => c.includes(tab));
  };

  const disconnected = mode === "live" && connection.status !== "connected";
  const full = variant === "full";

  let empty: string;
  if (disconnected) empty = `Not connected to rosbridge. Logs stream from ${settings.topics.rosout} once connected.`;
  else if (logs.length && (query || minLevel !== "DEBUG")) empty = "No log messages match the current filter.";
  else if (tab === "gazebo" && mode === "live")
    empty = "No Gazebo messages yet. Gazebo writes most output to its terminal; only ROS plugin messages on /rosout appear here.";
  else empty = "No log messages yet.";

  return (
    <section className={cn("panel flex min-h-[220px] flex-col overflow-hidden", className)} aria-label="Logs and Console">
      <header className="flex h-[44px] shrink-0 items-center gap-3 border-b border-line px-4">
        <SquareTerminal className="size-[20px]" strokeWidth={2} />
        <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Logs &amp; Console</h2>
        <DemoBadge />
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-[10px] py-[7px]">
        <div role="tablist" aria-label="Log source" className="flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "h-[34px] rounded-[5px] px-[23px] text-[13px] transition-colors",
                tab === t.id ? "bg-primary text-white" : "text-[#c8d3e7] hover:bg-surface-3",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {full && (
            <label className="relative">
              <span className="sr-only">Search logs</span>
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-[30px] w-44 rounded-[5px] border border-line-strong bg-surface-2 pl-7 pr-2 text-[12px] outline-none focus:border-primary"
              />
            </label>
          )}
          <label className="relative">
            <span className="sr-only">Minimum level</span>
            <select
              value={minLevel}
              onChange={(e) => setMinLevel(e.target.value as LogLevel)}
              className="h-[30px] appearance-none rounded-[5px] border border-line-strong bg-surface-2 pl-2.5 pr-7 text-[12px] text-fg outline-none focus:border-primary"
            >
              <option value="DEBUG">All levels</option>
              <option value="INFO">Info +</option>
              <option value="WARN">Warn +</option>
              <option value="ERROR">Error +</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" />
          </label>
          <Button size="sm" className="h-[30px] px-4 text-[12px] font-normal" onClick={clear}>
            Clear Logs
          </Button>
          <Button size="icon" className="h-[30px] w-[30px]" onClick={() => void copy()} title="Copy visible logs" aria-label="Copy visible logs">
            {copied === "ok" ? <Check className="size-3.5 text-ok-fg" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {disconnected && filtered.length > 0 && (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-err-soft/95 px-4 py-1 text-[12px] text-err-fg">
            <WifiOff className="size-3.5" /> Disconnected — showing buffered messages.
          </div>
        )}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="scroll-thin absolute inset-0 overflow-y-auto px-[18px] py-2 font-mono text-[12.5px] leading-[23px]"
          role="log"
          aria-live="polite"
          aria-label={`${TABS.find((t) => t.id === tab)?.label} output`}
        >
          {filtered.length === 0 ? (
            <p className="flex h-full items-center justify-center text-center font-sans text-[13px] text-fg-muted">
              {disconnected && <WifiOff className="mr-2 size-4 text-err-fg" />}
              {empty}
            </p>
          ) : (
            filtered.map((l) => (
              <div key={l.id} className="flex gap-[22px] whitespace-pre-wrap break-words" title={`${l.source} · ${new Date(l.time).toLocaleString()}`}>
                <span className="shrink-0 text-[#9fb0cf]">[{formatTimeOfDay(l.time)}]</span>
                <span className={cn("w-[58px] shrink-0", LEVEL_CLASS[l.level])}>[{l.level}]</span>
                {full && <span className="w-[200px] shrink-0 truncate text-fg-subtle">{l.source}</span>}
                <span className={cn("min-w-0", l.highlight ? "text-ok-fg" : l.level === "ERROR" || l.level === "FATAL" ? "text-err-fg" : "text-[#dbe4f3]")}>
                  {l.message}
                </span>
              </div>
            ))
          )}
        </div>
        {!stick && filtered.length > 0 && (
          <button
            onClick={() => setStick(true)}
            className="absolute bottom-2 right-4 z-10 flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] text-white shadow"
          >
            <ArrowDown className="size-3" /> Latest
          </button>
        )}
        {copied === "err" && <p className="absolute bottom-2 left-4 text-[11px] text-err-fg">Clipboard unavailable</p>}
      </div>
    </section>
  );
}
