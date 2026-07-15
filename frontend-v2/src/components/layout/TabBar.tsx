import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CloseIcon, FileTextIcon } from '@/components/icons';
import { useTabs, type Tab } from '@/contexts/TabContext';
import { cn } from '@/lib/utils';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, removeTab } = useTabs();
  const navigate = useNavigate();
  const location = useLocation();
  const pendingRemovalRef = useRef<{ tabId: string; wasActive: boolean } | null>(null);

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab.id);
    navigate(tab.url);
  };

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const wasActive = activeTabId === tabId;
    pendingRemovalRef.current = { tabId, wasActive };
    removeTab(tabId);
    if (wasActive && tabs.length === 1) navigate('/');
  };

  useEffect(() => {
    const pending = pendingRemovalRef.current;
    if (!pending) return;

    const { tabId, wasActive } = pending;
    const stillExists = tabs.some((t) => t.id === tabId);

    if (!stillExists && wasActive && tabs.length > 0) {
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab && location.pathname !== activeTab.url) {
        navigate(activeTab.url);
      } else if (!activeTab) {
        const last = tabs[tabs.length - 1];
        if (last) { setActiveTab(last.id); navigate(last.url); }
      }
    } else if (!stillExists && wasActive && tabs.length === 0) {
      if (location.pathname.startsWith('/papers/')) navigate('/');
    }

    pendingRemovalRef.current = null;
  }, [tabs, activeTabId, navigate, setActiveTab, location.pathname]);

  if (tabs.length === 0) return null;

  return (
    <div className="relative bg-(--white) overflow-x-auto border-b border-(--border)">
      <div className="flex items-end gap-0.5 min-h-9 bg-(--white)">
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id;
          return (
            <div
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={cn(
                'relative flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg border-x border-t',
                'cursor-pointer transition-colors min-w-0 max-w-50 shrink-0',
                isActive
                  ? 'bg-(--background) border-(--border) text-(--foreground) z-10'
                  : 'bg-(--white) border-transparent text-(--muted-foreground) hover:bg-(--muted) hover:text-(--foreground)',
              )}
            >
              <FileTextIcon size="xs" className="shrink-0 opacity-60" />
              <span className="truncate flex-1 text-caption font-medium">{tab.title}</span>
              <button
                onClick={(e) => handleClose(e, tab.id)}
                aria-label="Close tab"
                className="p-0.5 hover:bg-(--border) rounded shrink-0"
              >
                <CloseIcon size="xs" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
