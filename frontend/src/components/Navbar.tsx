import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SearchInput } from '@/components/SearchInput';
import { Breadcrumb, type BreadcrumbItem } from '@/components/Breadcrumb';
import { papersApi } from '@/lib/api/papers';
import { groupsApi, type Group } from '@/lib/api/groups';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const [searchQuery, setSearchQuery] = useState('');

  // Get paper data if on paper detail page
  const paperId = params.id ? parseInt(params.id) : null;
  const { data: paper } = useQuery({
    queryKey: ['paper', paperId],
    queryFn: () => papersApi.get(paperId!),
    enabled: !!paperId && location.pathname.startsWith('/papers/'),
  });

  // Get group data if on group detail page
  const groupId = params.id ? parseInt(params.id) : null;
  const { data: group } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => groupsApi.get(groupId!),
    enabled: !!groupId && location.pathname.startsWith('/groups/'),
  });

  // Get all groups to build breadcrumb path
  const { data: allGroups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
    enabled: location.pathname.startsWith('/groups/'),
  });

  const handleSearch = (query: string) => {
    if (query.trim())
    {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  // Get search query from URL if on search page
  useEffect(() => {
    if (location.pathname === '/search')
    {
      const params = new URLSearchParams(location.search);
      const q = params.get('q');
      if (q)
      {
        setSearchQuery(q);
      } else
      {
        setSearchQuery('');
      }
    } else
    {
      setSearchQuery('');
    }
  }, [location]);

  // Build breadcrumb items based on current route
  const buildBreadcrumbItems = () => {
    const path = location.pathname;

    // Paper detail page
    if (path.startsWith('/papers/') && paper)
    {
      return [
        { id: 'home', label: 'Home', href: '/' },
        { id: 'papers', label: 'Papers', href: '/' },
        { id: paper.id, label: paper.title },
      ];
    }

    // Group detail page
    if (path.startsWith('/groups/') && group && allGroups)
    {
      const buildBreadcrumb = (groupId: number, groups: Group[]): Group[] => {
        const groupMap = new Map(groups.map((g) => [g.id, g]));
        const path: Group[] = [];
        let currentGroup = groupMap.get(groupId);

        while (currentGroup?.parent_id)
        {
          const parent = groupMap.get(currentGroup.parent_id);
          if (parent)
          {
            path.unshift(parent);
            currentGroup = parent;
          } else
          {
            break;
          }
        }

        return path;
      };

      const breadcrumb = buildBreadcrumb(group.id, allGroups);
      return [
        { id: 'groups', label: 'Groups', href: '/groups' },
        ...breadcrumb.map((g) => ({ id: g.id, label: g.name, href: `/groups/${g.id}` })),
        { id: group.id, label: group.name },
      ];
    }

    // Paper Citations page
    if (path === '/citations')
    {
      return [
        { id: 'home', label: 'Home', href: '/' },
        { id: 'citations', label: 'Paper Citations' },
      ];
    }

    // Ingest Paper page
    if (path === '/ingest')
    {
      return [
        { id: 'home', label: 'Home', href: '/' },
        { id: 'ingest', label: 'Ingest Paper' },
      ];
    }

    // Export Papers page
    if (path === '/export')
    {
      // Try to get context from location state
      const state = location.state as { context?: string; returnPath?: string } | null;
      const context = state?.context;
      const returnPath = state?.returnPath;

      const breadcrumb: BreadcrumbItem[] = [{ id: 'home', label: 'Home', href: '/' }];

      // Add context-specific breadcrumb if available
      if (returnPath === '/groups' || context === 'Groups')
      {
        breadcrumb.push({ id: 'groups', label: 'Groups', href: '/groups' });
      } else if (returnPath?.startsWith('/groups/'))
      {
        // Try to get group name from query or state
        const groupId = returnPath.split('/groups/')[1];
        if (groupId && group)
        {
          breadcrumb.push({ id: 'groups', label: 'Groups', href: '/groups' });
          breadcrumb.push({ id: group.id, label: group.name, href: returnPath });
        } else
        {
          breadcrumb.push({ id: 'groups', label: 'Groups', href: '/groups' });
        }
      }

      breadcrumb.push({ id: 'export', label: 'Export Papers' });
      return breadcrumb;
    }

    return null;
  };

  const breadcrumbItems = buildBreadcrumbItems();

  return (
    <header className="bg-grayscale-8 sticky top-0 z-50 rounded-trl-lg">
      <div className="flex h-16 items-center justify-between gap-4 px-6">
        {/* Left: Breadcrumb */}
        <div className="flex-1 min-w-0">
          {breadcrumbItems && (
            <Breadcrumb items={breadcrumbItems} />
          )}
        </div>
        {/* Right: Search and User controls */}
        <div className="flex items-center gap-3">
          <div className="w-96 hidden md:block">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSearch={handleSearch}
              placeholder="Search..."
              debounceMs={500}
              showIcon
              size="compact"
              dark={false}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
