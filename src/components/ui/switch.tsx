"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-[2px] border border-[#232320] bg-[#0B0B0A] p-0.5 transition-colors focus-visible:outline-none focus-visible:border-[#FF5500] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[#FF5500] data-[state=checked]:bg-[#FF5500]/20",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-2.5 w-3 rounded-[1px] bg-[#63635E] transition-transform data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-[#FF5500] data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
