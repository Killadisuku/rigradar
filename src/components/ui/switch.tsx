import * as SwitchPrimitives from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitives.Root>) {
  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-7 w-11 shrink-0 cursor-pointer items-center rounded-full shadow-border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-foreground shadow-sm",
          "transition-transform duration-150 ease-out",
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-1",
          "data-[state=checked]:bg-primary-foreground",
        )}
      />
    </SwitchPrimitives.Root>
  );
}
