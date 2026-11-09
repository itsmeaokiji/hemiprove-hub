import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[2px] font-mono text-xs font-medium uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF5500] disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-[#FF5500] text-[#0B0B0A] font-semibold hover:bg-[#E04800]",
        secondary:
          "border border-[#232320] bg-[#111110] text-[#EDEDEC] hover:bg-[#181816]",
        outline:
          "border border-[#232320] bg-[#0B0B0A] text-[#9A9A94] hover:bg-[#181816] hover:text-[#EDEDEC]",
        ghost: "text-[#9A9A94] hover:bg-[#181816] hover:text-[#EDEDEC]",
        destructive: "border border-[#F43F5E]/40 bg-[#F43F5E]/10 text-[#F43F5E] hover:bg-[#F43F5E]/20",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-7 px-2.5 text-[11px]",
        lg: "h-10 px-4 text-xs",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
