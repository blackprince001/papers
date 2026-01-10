"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;

function SelectGroup({ ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
  placeholder,
  ...props
}: SelectPrimitive.Value.Props & {
  placeholder?: string;
}) {
  if (!placeholder)
  {
    return <SelectPrimitive.Value data-slot="select-value" {...props} />;
  }

  return (
    <SelectPrimitive.Value
      render={(_, { value }) => {
        if (value)
        {
          return <SelectPrimitive.Value data-slot="select-value" {...props} />;
        }

        // Placeholder
        return (
          <span data-slot="select-value" className="text-gray-600">
            {placeholder}
          </span>
        );
      }}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "border-gray-300 data-[placeholder]:text-gray-600 [&_svg:not([class*='text-'])]:text-gray-600 focus-visible:border-corca-blue-medium focus-visible:ring-corca-blue-medium/50 aria-invalid:ring-red-500/20 aria-invalid:border-red-500 bg-white flex w-fit items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={<ChevronDownIcon className="size-4 opacity-50" />}
      />
    </SelectPrimitive.Trigger>
  );
}



interface SelectContentProps extends SelectPrimitive.Popup.Props {
  sideOffset?: number;
  align?: "start" | "center" | "end";
}

function SelectContent({
  className,
  children,
  sideOffset = 5,
  align = "center",
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        data-slot="select-positioner"
        alignItemWithTrigger={false}
        sideOffset={sideOffset}
        align={align}
        className="z-[100]"
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "p-1 bg-white text-gray-900 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-[100] max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md border border-gray-200 shadow-md",
            className
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
        <SelectScrollDownButton />
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("text-gray-600 px-2 py-1.5 text-xs", className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-gray-100 focus:text-gray-900 [&_svg:not([class*='text-'])]:text-gray-600 relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-gray-200 pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: SelectPrimitive.ScrollUpArrow.Props) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "w-full bg-white z-51 text-center cursor-default h-6 flex items-center justify-center text-md border border-gray-200 data-[direction=up]:border-b-0 data-[direction=down]:border-t-0 data-[direction=up]:rounded-t-md data-[direction=down]:rounded-b-md",
        "before:content-[''] before:absolute before:w-full before:h-full before:left-0 data-[direction=up]:before:top-full data-[direction=down]:bottom-0 data-[direction=down]:before:-bottom-full",
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpArrow>
  );
}
function SelectScrollDownButton({
  className,
  ...props
}: SelectPrimitive.ScrollDownArrow.Props) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "w-full bg-white z-51 text-center cursor-default h-6 flex items-center justify-center text-md border border-gray-200 data-[direction=up]:border-b-0 data-[direction=down]:border-t-0 data-[direction=up]:rounded-t-md data-[direction=down]:rounded-b-md",
        "before:content-[''] before:absolute before:w-full before:h-full before:left-0 data-[direction=up]:before:top-full data-[direction=down]:bottom-0 data-[direction=down]:before:-bottom-full",
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
