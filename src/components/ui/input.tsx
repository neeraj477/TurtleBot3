import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-[5px] border border-line-strong bg-surface-2 px-3 text-[14px] text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-primary focus:ring-1 focus:ring-primary/50 aria-[invalid=true]:border-err disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
