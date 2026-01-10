import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

interface PopoverTriggerProps extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger> {
  asChild?: boolean
}

const PopoverTrigger = React.forwardRef<
  HTMLButtonElement,
  PopoverTriggerProps
>(({ children, asChild, ...props }, ref) => {
  if (asChild && React.isValidElement(children))
  {
    return (
      <PopoverPrimitive.Trigger
        render={({ ...triggerProps }) => {
          const childProps = (children as React.ReactElement).props || {};
          return React.cloneElement(children as React.ReactElement, {
            ...triggerProps,
            ...childProps,
          });
        }}
        {...props}
      />
    );
  }

  return (
    <PopoverPrimitive.Trigger ref={ref} {...props}>
      {children}
    </PopoverPrimitive.Trigger>
  );
});
PopoverTrigger.displayName = "PopoverTrigger"

interface PopoverContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Popup>, 'align'> {
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
  sideOffset?: number
}

const PopoverContent = React.forwardRef<
  HTMLDivElement,
  PopoverContentProps
>(({ className, align = "center", side = "bottom", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Positioner side={side} sideOffset={sideOffset} align={align}>
      <PopoverPrimitive.Popup
        ref={ref}
        className={cn(
          "z-[100] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Positioner>
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Popup.displayName

export { Popover, PopoverTrigger, PopoverContent }

