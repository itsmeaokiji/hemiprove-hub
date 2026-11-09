import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider tabular-nums",
  {
    variants: {
      variant: {
        default: "border-[#FF5500]/40 bg-[#FF5500]/10 text-[#FF5500]",
        secondary: "border-[#232320] bg-[#181816] text-[#9A9A94]",
        outline: "border-[#232320] bg-transparent text-[#9A9A94]",
        success: "border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]",
        warning: "border-[#FF5500]/35 bg-[#FF5500]/10 text-[#FF5500]",
        danger: "border-[#F43F5E]/30 bg-[#F43F5E]/10 text-[#F43F5E]",
        risc0: "border-[#232320] bg-[#181816] text-[#EDEDEC]",
        sp1: "border-[#232320] bg-[#181816] text-[#EDEDEC]",
        openvm: "border-[#232320] bg-[#181816] text-[#EDEDEC]",
        nvidia: "border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]",
        amd: "border-[#F43F5E]/30 bg-[#F43F5E]/10 text-[#F43F5E]",
        intel: "border-[#38BDF8]/30 bg-[#38BDF8]/10 text-[#38BDF8]",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
