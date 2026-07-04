import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { Home, Chart as BarChart3, Gps as Compass, Notepad2 as Newspaper, MagicStar as Sparkles, Book1 as Library, DocumentText as FileText, Hierarchy as GitBranch, People as Users, Archive, Folder, ArrowDown2 as ChevronDown, SidebarLeft as PanelLeftClose, SidebarLeft as PanelLeftOpen, Shield } from 'iconsax-reactjs';
import { groupsApi, type Group } from '@/lib/api/groups';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface GroupTreeNode extends Group {
  children: GroupTreeNode[];
}

function buildGroupTree(groups: Group[]): GroupTreeNode[] {
  const map = new Map<number, GroupTreeNode>();
  const roots: GroupTreeNode[] = [];

  groups.forEach((g) => map.set(g.id, { ...g, children: [] }));
  groups.forEach((g) => {
    const node = map.get(g.id)!;
    if (g.parent_id)
    {
      map.get(g.parent_id)?.children.push(node);
    } else
    {
      roots.push(node);
    }
  });

  return roots;
}

function GroupTreeItem({ group, level = 0 }: { group: GroupTreeNode; level?: number }) {
  const location = useLocation();
  const [expanded, setExpanded] = useState(true);
  const hasChildren = group.children.length > 0;
  const isActive = location.pathname === `/groups/${group.id}`;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 h-7 rounded-lg text-code font-normal',
          'hover:bg-(--muted) transition-colors duration-150 cursor-pointer',
          isActive
            ? 'bg-(--muted) text-(--foreground)'
            : 'text-(--muted-foreground) hover:text-(--foreground)',
        )}
        style={{ paddingLeft: `${(8 + level * 12) / 16}rem`, paddingRight: '0.5rem' }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 shrink-0 hover:bg-(--border) rounded"
          >
            <motion.div animate={{ rotate: expanded ? 0 : -90 }} transition={{ duration: 0.15 }}>
              <ChevronDown size={13} />
            </motion.div>
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <Link to={`/groups/${group.id}`} className="flex items-center gap-2 flex-1 min-w-0">
          <Folder size={14} className="shrink-0" />
          <span className="truncate text-caption">{group.name}</span>
        </Link>
      </div>
      <AnimatePresence>
        {hasChildren && expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            {group.children.map((child) => (
              <GroupTreeItem key={child.id} group={child} level={level + 1} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Nav group definitions ──────────────────────────────────────────────────

const CORE_NAV = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/dashboard', icon: BarChart3, label: 'Dashboard' },
  { href: '/papers', icon: FileText, label: 'Library' },
  { href: '/groups', icon: Library, label: 'Groups' },
];

const DISCOVER_NAV = [
  { href: '/discovery', icon: Compass, label: 'Discovery' },
  { href: '/huggingface-papers', icon: Newspaper, label: 'HF Papers' },
  { href: '/recommendations', icon: Sparkles, label: 'For You' },
];

const TOOLS_NAV = [
  { href: '/annotations', icon: FileText, label: 'Annotations' },
  { href: '/citations', icon: GitBranch, label: 'Citations' },
  { href: '/author', icon: Users, label: 'Authors' },
];

function NavItem({
  href, icon: Icon, label, isOpen, isActive,
}: {
  href: string; icon: React.ElementType; label: string; isOpen: boolean; isActive: boolean;
}) {
  return (
    <Link
      to={href}
      title={!isOpen ? label : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg transition-colors duration-150 select-none',
        isOpen ? 'h-8 px-2.5' : 'h-8 w-8 justify-center mx-auto',
        isActive
          ? 'bg-(--muted) text-(--foreground) font-medium'
          : 'text-(--muted-foreground) hover:bg-(--muted) hover:text-(--foreground)',
      )}
    >
      <Icon size={15} className="shrink-0" />
      {isOpen && <span className="text-code truncate">{label}</span>}
    </Link>
  );
}

function SectionLabel({ label, isOpen }: { label: string; isOpen: boolean }) {
  if (!isOpen) return <div className="my-2 mx-auto w-5 border-t border-(--border)" />;
  return (
    <p className="text-micro py-2 font-semibold uppercase tracking-widest text-(--muted-foreground) px-2.5 mt-5 mb-1.5">
      {label}
    </p>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const location = useLocation();
  const { isAdmin } = useAuth();

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
    staleTime: 5 * 60_000,
  });

  const groupTree = useMemo(() => buildGroupTree(groups), [groups]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-full h-full rounded-(--panel-radius) border border-(--panel-border) bg-(--panel-surface) shadow-(--shadow-panel) backdrop-blur-sm flex flex-col overflow-hidden">
      {/* Brand / collapse toggle */}
      <div className={cn('flex items-center h-12 shrink-0 px-3 mt-2', isOpen ? 'justify-between' : 'justify-center')}>
        {isOpen && (
          <Link to="/" className="group flex items-center gap-2.5">
            <Logo size={52} className="shrink-0 group-hover:opacity-80 transition-opacity" />
            <span className="text-subsection font-bold tracking-tight text-(--foreground) group-hover:opacity-70 transition-opacity">
              Lumen
            </span>
          </Link>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--muted) rounded-lg transition-colors"
          aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5">
        {CORE_NAV.map((item) => (
          <NavItem key={item.href} {...item} isOpen={isOpen} isActive={isActive(item.href)} />
        ))}

        <SectionLabel label="Discover" isOpen={isOpen} />
        {DISCOVER_NAV.map((item) => (
          <NavItem key={item.href} {...item} isOpen={isOpen} isActive={isActive(item.href)} />
        ))}

        <SectionLabel label="Tools" isOpen={isOpen} />
        {TOOLS_NAV.map((item) => (
          <NavItem key={item.href} {...item} isOpen={isOpen} isActive={isActive(item.href)} />
        ))}

        {/* Folders — only in expanded state */}
        {isOpen && (
          <>
            <SectionLabel label="Folders" isOpen={isOpen} />
            <div className="mt-0.5 space-y-0.5">
              {groupsLoading ? (
                <>
                  <Skeleton className="h-7 w-full rounded-lg" />
                  <Skeleton className="h-7 w-4/5 rounded-lg" />
                </>
              ) : groupTree.length > 0 ? (
                groupTree.map((group) => (
                  <GroupTreeItem key={group.id} group={group} />
                ))
              ) : (
                <p className="px-2.5 text-caption text-(--muted-foreground) opacity-60">No folders yet</p>
              )}
            </div>
          </>
        )}
      </nav>

      {/* Pinned bottom */}
      <div className="border-t border-(--panel-border) py-2.5 px-2.5 shrink-0 bg-(--panel-surface-muted)">
        <NavItem
          href="/discovery-archive"
          icon={Archive}
          label="Discovery Archive"
          isOpen={isOpen}
          isActive={isActive('/discovery-archive')}
        />
        {isAdmin && (
          <NavItem href="/admin/users" icon={Shield} label="User Management" isOpen={isOpen} isActive={isActive('/admin/users')} />
        )}
        <div className="mt-0.5">
          <UserMenu isOpen={isOpen} />
        </div>
      </div>
    </aside>
  );
}
