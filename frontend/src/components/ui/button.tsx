import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
          {
            "border border-blue-35 bg-primary text-primary-foreground hover:bg-primary/95":
              variant === "default",
            "border border-red-17 bg-destructive text-destructive-foreground hover:bg-destructive/95":
              variant === "destructive",
            "border border-blue-21 hover:bg-accent/90 hover:text-accent-foreground":
              variant === "outline",
            "border border-blue-21 bg-secondary text-secondary-foreground hover:bg-secondary/90":
              variant === "secondary",
            "border border-blue-31 hover:bg-blue-14 hover:text-blue-38": variant === "ghost",
            "text-primary underline-offset-4 hover:underline": variant === "link",
          },
          {
            "h-11 px-4 py-2": size === "default",        // 44px
            "h-11 rounded-md px-4": size === "sm",       // 44px
            "h-12 rounded-md px-8": size === "lg",       // 48px
            "size-11": size === "icon",                  // 44x44px
          },
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }








