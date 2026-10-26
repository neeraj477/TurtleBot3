import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  icon?: ReactNode;
  title: string;
  actions?: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/** Card with the reference's header style: icon + semibold title, optional right-side actions. */
export function Panel({ icon, title, actions, className, headerClassName, bodyClassName, children }: PanelProps) {
  return (
    <section className={cn("panel flex min-h-0 flex-col overflow-hidden", className)} aria-label={title}>
      <header className={cn("flex h-[50px] shrink-0 items-center gap-3 border-b border-line px-4", headerClassName)}>
        {icon && <span className="flex text-fg [&_svg]:size-[20px]">{icon}</span>}
        <h2 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}
