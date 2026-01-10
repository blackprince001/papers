import * as React from "react"
import { ChevronRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface PaginationProps extends React.ComponentPropsWithoutRef<"nav"> {}

const Pagination = React.forwardRef<HTMLElement, PaginationProps>(
  ({ className, ...props }, ref) => (
    <nav
      ref={ref}
      role="navigation"
      aria-label="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
)
Pagination.displayName = "Pagination"

const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentPropsWithoutRef<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
))
PaginationContent.displayName = "PaginationContent"

const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentPropsWithoutRef<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
))
PaginationItem.displayName = "PaginationItem"

type PaginationLinkProps = {
  isActive?: boolean
} & React.ComponentPropsWithoutRef<"a">

const PaginationLink = React.forwardRef<
  HTMLAnchorElement,
  PaginationLinkProps
>(({ className, isActive, ...props }, ref) => (
  <a
    ref={ref}
    aria-current={isActive ? "page" : undefined}
    className={cn(
      "inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-sm font-medium shadow-sm transition-colors hover:bg-gray-200 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground aria-[current=page]:shadow-none",
      isActive && "bg-primary text-primary-foreground shadow-none",
      className
    )}
    {...props}
  />
))
PaginationLink.displayName = "PaginationLink"

const PaginationEllipsis = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span">) => (
  <span
    aria-hidden
    className={cn("flex h-9 w-9 items-center justify-center", className)}
    {...props}
  >
    <ChevronRightIcon className="h-4 w-4" />
    <span className="sr-only">More pages</span>
  </span>
)
PaginationEllipsis.displayName = "PaginationEllipsis"

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
}

