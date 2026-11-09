import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-8 w-full rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2.5 py-1 font-mono text-xs tabular-nums text-[#EDEDEC] placeholder:text-[#63635E] transition-colors focus-visible:border-[#FF5500] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
