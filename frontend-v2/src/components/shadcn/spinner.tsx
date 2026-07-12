import type React from "react"

import { cn } from "@/lib/utils"
import { SpinnerIcon, type IconProps } from "@/components/icons"

export function Spinner({
  className,
  ...props
}: IconProps): React.ReactElement {
  return (
    <SpinnerIcon
      aria-hidden={false}
      aria-label="Loading"
      className={cn("animate-spin", className)}
      data-slot="spinner"
      role="status"
      {...props}
    />
  )
}
