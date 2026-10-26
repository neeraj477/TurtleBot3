import { Bot } from "lucide-react";
import { NAV_ITEMS, type PageId } from "./navItems";
import { useSettings } from "@/data/settings";
import { useDashboard } from "@/data/store";
import { cn } from "@/lib/utils";

interface SidebarProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
  open: boolean;
}

export function Sidebar({ page, onNavigate, open }: SidebarProps) {
  const settings = useSettings();
  const mode = useDashboard((s) => s.mode);
  const distro = useDashboard((s) => s.graph?.rosDistro ?? null);
  const rosLabel = mode === "demo" ? "ROS 2 (Demo)" : distro ? `ROS 2 ${distro.charAt(0).toUpperCase()}${distro.slice(1)}` : "ROS 2";

  return (
    <nav
      aria-label="Main"
      className={cn(
        "flex w-[192px] shrink-0 flex-col border-r border-line bg-chrome",
        "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:top-[84px] max-lg:z-40 max-lg:shadow-2xl max-lg:transition-transform",
        open ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
      )}
    >
      <ul className="flex flex-col gap-[7px] px-3 pt-6">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = id === page;
          return (
            <li key={id}>
              <a
                href={`#/${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(id);
                }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-[50px] items-center gap-[16px] rounded-[6px] px-[17px] text-[15px] transition-colors",
                  active ? "bg-primary text-white" : "text-[#d5def0] hover:bg-surface-3",
                )}
              >
                <Icon className={cn("size-[26px] shrink-0", active && id === "overview" && "fill-current")} strokeWidth={1.9} />
                {label}
              </a>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex items-center gap-3 border-t border-line px-6 py-[22px]">
        <Bot className="size-[30px] shrink-0 text-[#d5def0]" strokeWidth={1.8} />
        <div className="min-w-0">
          <p className="truncate text-[12px] text-fg">{settings.robotModel}</p>
          <p className="mt-1.5 truncate text-[12px] text-fg-muted" title={rosLabel}>
            {rosLabel}
          </p>
        </div>
      </div>
    </nav>
  );
}
