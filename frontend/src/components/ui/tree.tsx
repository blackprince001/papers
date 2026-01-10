import * as React from "react"
import { cn } from "@/lib/utils"

interface TreeProps extends React.HTMLAttributes<HTMLDivElement> {
  indent?: number
  tree: any // The tree instance from useTree hook
}

const Tree = React.forwardRef<HTMLDivElement, TreeProps>(
  ({ className, indent = 20, tree, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("w-full", className)}
        style={{ "--tree-indent": `${indent}px` } as React.CSSProperties}
        {...props}
      />
    )
  }
)
Tree.displayName = "Tree"

interface TreeItemProps extends React.HTMLAttributes<HTMLDivElement> {
  item: any // Tree item from useTree hook
  indent?: number
  depth?: number // Optional depth prop if getDepth is not available
}

const TreeItem = React.forwardRef<HTMLDivElement, TreeItemProps>(
  ({ className, item, indent = 20, depth: propDepth, ...props }, ref) => {
    // Calculate depth - try prop first, then item methods
    let depth = propDepth ?? 0;

    if (depth === 0 && item)
    {
      try
      {
        if (typeof item.getDepth === 'function')
        {
          depth = item.getDepth();
        } else if (item.getPath && typeof item.getPath === 'function')
        {
          // Fallback: calculate depth from path
          const path = item.getPath();
          if (path && typeof path === 'string')
          {
            depth = Math.max(0, path.split('/').length - 2); // Subtract 2 for root and current item
          }
        } else if (item.getLevel && typeof item.getLevel === 'function')
        {
          // Alternative method name some tree libraries use
          depth = item.getLevel();
        } else if (item.getId)
        {
          // Last resort: try to infer from ID structure
          const id = item.getId();
          if (typeof id === 'string' && id.includes('/'))
          {
            depth = id.split('/').length - 1;
          }
        }
      } catch (e)
      {
        // If depth calculation fails, default to 0
        console.warn('Failed to calculate tree item depth:', e);
        depth = 0;
      }
    }

    // Ensure depth is non-negative
    depth = Math.max(0, depth);

    return (
      <div
        ref={ref}
        className={cn("relative", className)}
        style={{ paddingLeft: `${depth * indent}px` }}
        {...props}
      />
    )
  }
)
TreeItem.displayName = "TreeItem"

interface TreeItemLabelProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  item?: any // Tree item from useTree hook
}

const TreeItemLabel = React.forwardRef<HTMLButtonElement, TreeItemLabelProps>(
  ({ className, item, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
TreeItemLabel.displayName = "TreeItemLabel"

export { Tree, TreeItem, TreeItemLabel }

