import { useState, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { Home, Library, FileText, Folder, ChevronDown, ChevronRight, ChevronLeft, BarChart3, GitBranch, Compass, Sparkles, Archive } from 'lucide-react';
import { groupsApi, type Group } from '@/lib/api/groups';
import { cn } from '@/lib/utils';

interface SidebarProps {
  className?: string;
  isOpen?: boolean;
  onToggle?: () => void;
}

interface GroupTreeNode extends Group {
  children?: GroupTreeNode[];
}

function GroupTreeItem({ group, level = 0, location }: { group: GroupTreeNode; level?: number; location: ReturnType<typeof useLocation> }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = group.children && group.children.length > 0;
  const isActive = location.pathname === `/groups/${group.id}`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-sm text-sm transition-all duration-200",
          isActive
            ? "bg-green-4 text-anara-light-text shadow-sm"
            : "text-anara-light-text-muted hover:bg-green-5 hover:shadow-sm"
        )}
        style={{ paddingLeft: `${0.75 + level * 0.5}rem` }}
      >
        {hasChildren ? (
          <motion.button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0.5 hover:bg-green-5 rounded flex-shrink-0"
            whileTap={{ scale: 0.9 }}
          >
            <motion.div
              animate={{ rotate: isExpanded ? 0 : -90 }}
              transition={{ duration: 0.15 }}
            >
              <ChevronDown size={14} className="text-anara-light-text-muted" />
            </motion.div>
          </motion.button>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}
        <Link
          to={`/groups/${group.id}`}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <Folder size={16} className="flex-shrink-0" />
          <span className="truncate">{group.name}</span>
        </Link>
      </div>
      <AnimatePresence>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mt-1 overflow-hidden"
          >
            {group.children!.map((child) => (
              <GroupTreeItem key={child.id} group={child} level={level + 1} location={location} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Sidebar({ className, isOpen = true, onToggle }: SidebarProps) {
  const location = useLocation();

  // Fetch groups from API
  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  // Build tree structure from groups
  const groupTree = useMemo(() => {
    if (!groups || groups.length === 0) return [];

    const groupMap = new Map<number, GroupTreeNode>();
    const roots: GroupTreeNode[] = [];

    // First pass: create all nodes
    groups.forEach((group) => {
      groupMap.set(group.id, { ...group, children: [] });
    });

    // Second pass: build tree
    groups.forEach((group) => {
      const node = groupMap.get(group.id)!;
      if (group.parent_id)
      {
        const parent = groupMap.get(group.parent_id);
        if (parent)
        {
          if (!parent.children) parent.children = [];
          parent.children.push(node);
        }
      } else
      {
        roots.push(node);
      }
    });

    return roots;
  }, [groups]);

  const isActive = (path: string) => {
    if (path === '/')
    {
      return location.pathname === '/' || location.pathname === '';
    }
    return location.pathname.startsWith(path);
  };

  const navigationItems = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/dashboard', icon: BarChart3, label: 'Dashboard' },
    { href: '/discovery', icon: Compass, label: 'Discovery' },
    { href: '/recommendations', icon: Sparkles, label: 'For You' },
    { href: '/groups', icon: Library, label: 'Library' },
    { href: '/annotations', icon: FileText, label: 'Annotations' },
  ];

  if (!isOpen)
  {
    return (
      <aside className={cn("w-full h-full bg-grayscale-8 text-anara-light-text flex flex-col border-r border-anara-light-border rounded-r-sm shadow-sm", className)}>
        <div className="p-2 flex items-center justify-center">
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-green-5 rounded-sm transition-colors"
            aria-label="Expand sidebar"
          >
            <ChevronRight size={32} className="text-anara-light-text" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center py-4 space-y-4">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                to={item.href}
                className={cn(
                  "p-2 rounded-sm transition-all duration-200",
                  active
                    ? "bg-gray-100 text-anara-light-text shadow-sm"
                    : "text-anara-light-text-muted hover:bg-gray-200 hover:shadow-sm"
                )}
                title={item.label}
              >
                <Icon size={20} />
              </Link>
            );
          })}
          {/* Paper Citations icon for collapsed sidebar */}
          <Link
            to="/citations"
            className={cn(
              "p-2 rounded-sm transition-all duration-200",
              isActive('/citations')
                ? "bg-gray-100 text-anara-light-text shadow-sm"
                : "text-anara-light-text-muted hover:bg-gray-200 hover:shadow-sm"
            )}
            title="Paper Citations"
          >
            <GitBranch size={20} />
          </Link>
        </div>
        {/* Footer - Discovery Archive */}
        <div className="mt-auto border-t border-anara-light-border pt-4">
          <Link
            to="/discovery-archive"
            className={cn(
              "p-2 rounded-sm transition-all duration-200 flex items-center justify-center",
              isActive('/discovery-archive')
                ? "bg-gray-100 text-anara-light-text shadow-sm"
                : "text-anara-light-text-muted hover:bg-gray-200 hover:shadow-sm"
            )}
            title="Discovery Archive"
          >
            <Archive size={20} />
          </Link>
        </div>
      </aside>
    );
  }

  return (
    <aside className={cn("w-full h-full bg-grayscale-8 text-anara-light-text flex flex-col border-r border-anara-light-border rounded-r-lg", className)}>
      {/* Logo/Brand Section */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="text-xl text-anara-light-text tracking-tight group-hover:opacity-80 transition-opacity duration-200">Papers</span>
          </Link>
          {onToggle && (
            <button
              onClick={onToggle}
              className="p-1.5 hover:bg-green-5 rounded-sm transition-all duration-200 hover:shadow-sm"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft size={20} className="text-anara-light-text-muted" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-blue-14 text-blue-38 shadow-sm"
                    : "text-anara-light-text-muted hover:bg-blue-14 hover:text-blue-38 hover:shadow-sm"
                )}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Paper Citations - Separate section before Folders */}
        <div className="mt-6">
          <Link
            to="/citations"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium transition-all duration-200",
              isActive('/citations')
                ? "bg-gray-100 text-anara-light-text shadow-sm"
                : "text-anara-light-text-muted hover:bg-gray-200 hover:shadow-sm"
            )}
          >
            <GitBranch size={18} />
            <span>Paper Citations</span>
          </Link>
        </div>

        {/* Horizontal Separator */}
        <div className="my-4">
          <hr className="border-anara-light-border" />
        </div>

        {/* Groups Tree - Always visible */}
        <div>
          <h3 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-anara-light-text-muted">
            Folders
          </h3>
          {groupsLoading ? (
            <div className="text-xs text-anara-light-text-muted py-2">Loading groups...</div>
          ) : groupTree.length > 0 ? (
            <div className="space-y-1">
              {groupTree.map((group) => (
                <GroupTreeItem key={group.id} group={group} location={location} />
              ))}
            </div>
          ) : (
            <div className="text-xs text-anara-light-text-muted px-3 py-2">No groups yet</div>
          )}
        </div>

        {/* Horizontal Separator */}
        <div className="my-4">
          <hr className="border-anara-light-border" />
        </div>

        {/* Discovery Archive - Footer */}
        <div>
          <Link
            to="/discovery-archive"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium transition-all duration-200",
              isActive('/discovery-archive')
                ? "bg-gray-100 text-anara-light-text shadow-sm"
                : "text-anara-light-text-muted hover:bg-gray-200 hover:shadow-sm"
            )}
          >
            <Archive size={18} />
            <span>Discovery Archive</span>
          </Link>
        </div>
      </nav>
    </aside>
  );
}

