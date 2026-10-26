import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-[5px] font-medium", {
  variants: {
    tone: {
      ok: "bg-ok-soft text-ok-fg",
      warn: "bg-warn-soft text-warn",
      err: "bg-err-soft text-err-fg",
      info: "bg-primary-soft text-[#7fb0ff]",
      muted: "bg-surface-3 text-fg-muted",
    },
    size: {
      sm: "h-6 px-2 text-[11px]",
      md: "h-7 px-2.5 text-[13px]",
    },
  },
  defaultVariants: { tone: "ok", size: "md" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}
