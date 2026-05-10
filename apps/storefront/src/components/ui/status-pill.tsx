import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        live:
          "border-brand-500/40 bg-brand-500/10 text-brand-400",
        success:
          "border-success/40 bg-success/10 text-success",
        warning:
          "border-warning/40 bg-warning/10 text-warning",
        danger:
          "border-danger/40 bg-danger/10 text-danger",
        info:
          "border-info/40 bg-info/10 text-info",
        muted:
          "border-border-default bg-bg-elev text-fg-muted",
      },
    },
    defaultVariants: {
      variant: "muted",
    },
  }
);

const dotVariants = cva("h-1.5 w-1.5 rounded-full", {
  variants: {
    variant: {
      live: "bg-brand-500 animate-pulse-dot",
      success: "bg-success",
      warning: "bg-warning",
      danger: "bg-danger",
      info: "bg-info",
      muted: "bg-fg-subtle",
    },
  },
  defaultVariants: {
    variant: "muted",
  },
});

export interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {
  showDot?: boolean;
}

const StatusPill = React.forwardRef<HTMLSpanElement, StatusPillProps>(
  ({ className, variant, showDot = true, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(pillVariants({ variant }), className)}
      {...props}
    >
      {showDot ? <span className={dotVariants({ variant })} /> : null}
      {children}
    </span>
  )
);
StatusPill.displayName = "StatusPill";

export { StatusPill, pillVariants };
