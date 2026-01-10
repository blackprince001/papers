import * as React from "react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

interface NavigationMenuProps extends React.ComponentPropsWithoutRef<"nav"> {}

const NavigationMenu = React.forwardRef<HTMLElement, NavigationMenuProps>(
  ({ className, ...props }, ref) => (
    <nav
      ref={ref}
      className={cn("relative z-10 flex max-w-max flex-1 items-center justify-center", className)}
      {...props}
    />
  )
)
NavigationMenu.displayName = "NavigationMenu"

const NavigationMenuList = React.forwardRef<
  HTMLUListElement,
  React.ComponentPropsWithoutRef<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn(
      "group flex flex-1 list-none items-center justify-center space-x-1",
      className
    )}
    {...props}
  />
))
NavigationMenuList.displayName = "NavigationMenuList"

interface NavigationMenuItemProps extends React.ComponentPropsWithoutRef<"li"> {}

const NavigationMenuItem = React.forwardRef<
  HTMLLIElement,
  NavigationMenuItemProps
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
))
NavigationMenuItem.displayName = "NavigationMenuItem"

interface NavigationMenuLinkProps
  extends React.ComponentPropsWithoutRef<typeof Link> {
  active?: boolean
}

const NavigationMenuLink = React.forwardRef<
  HTMLAnchorElement,
  NavigationMenuLinkProps
>(({ className, active, children, ...props }, ref) => {
  return (
    <Link
      ref={ref}
      className={cn(
        "group inline-flex h-9 w-max items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-accent/50 data-[state=open]:bg-accent/50",
        active && "bg-accent/50 text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </Link>
  )
})
NavigationMenuLink.displayName = "NavigationMenuLink"

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
}














