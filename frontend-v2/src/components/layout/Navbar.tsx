import { useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MenuIcon, PanelRightOpenIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Breadcrumb, type BreadcrumbItem } from '@/components/Breadcrumb';
import { papersApi } from '@/lib/api/papers';
import { groupsApi } from '@/lib/api/groups';

interface NavbarProps {
  onMenuToggle: () => void;
  showChatToggle?: boolean;
  onChatToggle?: () => void;
}

function useBreadcrumbs(): BreadcrumbItem[] {
  const location = useLocation();
  const params = useParams<{ id?: string }>();
  const paperId = params.id ? parseInt(params.id) : undefined;
  const isPaperDetail = /^\/papers\/\d+/.test(location.pathname);
  const isGroupDetail = /^\/groups\/\d+/.test(location.pathname);
  const groupId = isGroupDetail && params.id ? parseInt(params.id) : undefined;

  const { data: paper } = useQuery({
    queryKey: ['paper', paperId],
    queryFn: () => papersApi.get(paperId!),
    enabled: isPaperDetail && paperId !== undefined,
    staleTime: 5 * 60_000,
  });

  const { data: allGroups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
    enabled: isGroupDetail,
    staleTime: 5 * 60_000,
  });

  const path = location.pathname;
  if (path === '/') return [{ id: 'home', label: 'Home' }];

  const segments = path.split('/').filter(Boolean);

  if (isPaperDetail) {
    return [
      { id: 'home', label: 'Home', href: '/' },
      { id: 'papers', label: 'Papers', href: '/papers' },
      { id: 'paper', label: paper?.title ?? `Paper ${paperId}` },
    ];
  }

  if (isGroupDetail && allGroups && groupId) {
    const group = allGroups.find(g => g.id === groupId);
    if (group) {
      const breadcrumbs: BreadcrumbItem[] = [
        { id: 'home', label: 'Home', href: '/' },
        { id: 'groups', label: 'Library', href: '/groups' },
      ];
      
      // Build path from root to current group
      const path = [];
      let current: typeof group | undefined = group;
      while (current) {
        path.unshift(current);
        current = current.parent_id ? allGroups.find(g => g.id === current!.parent_id) : undefined;
      }
      
      path.forEach((g, i) => {
        breadcrumbs.push({
          id: `group-${g.id}`,
          label: g.name,
          href: i < path.length - 1 ? `/groups/${g.id}` : undefined,
        });
      });
      
      return breadcrumbs;
    }
  }

  return [
    { id: 'home', label: 'Home', href: '/' },
    ...segments.map((seg, i) => ({
      id: `${seg}-${i}`,
      label: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
      href: i < segments.length - 1 ? '/' + segments.slice(0, i + 1).join('/') : undefined,
    })),
  ];
}

export default function Navbar({ onMenuToggle, showChatToggle, onChatToggle }: NavbarProps) {
  const breadcrumbs = useBreadcrumbs();

  return (
    <header className="bg-transparent sticky top-0 z-50">
      <div className="flex h-12 items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            variant="icon"
            size="icon"
            className="md:hidden shrink-0"
            onClick={onMenuToggle}
            aria-label="Toggle menu"
          >
            <MenuIcon size="lg" />
          </Button>
          <Breadcrumb items={breadcrumbs} />
        </div>

        <div className="flex items-center gap-1">
          {showChatToggle && (
            <Button
              variant="icon"
              size="icon"
              onClick={onChatToggle}
              aria-label="Open chat panel"
            >
              <PanelRightOpenIcon size="md" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
