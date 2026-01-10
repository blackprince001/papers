import { useTabs, type Tab } from '@/contexts/TabContext';
import { X, FileText } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, removeTab } = useTabs();
  const navigate = useNavigate();
  const location = useLocation();
  const pendingRemovalRef = useRef<{ tabId: string; wasActive: boolean } | null>(null);

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab.id);
    navigate(tab.url);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const wasActive = activeTabId === tabId;

    // Store removal info before removing
    pendingRemovalRef.current = { tabId, wasActive };

    removeTab(tabId);

    // If closing active tab and no tabs will remain, navigate immediately
    if (wasActive && tabs.length === 1)
    {
      navigate('/');
    }
  };

  // Handle navigation after tab removal state updates
  useEffect(() => {
    if (pendingRemovalRef.current)
    {
      const { tabId, wasActive } = pendingRemovalRef.current;

      // Check if the tab was actually removed
      const tabStillExists = tabs.some(t => t.id === tabId);

      if (!tabStillExists && wasActive)
      {
        // Tab was removed and it was active - navigate based on new state
        if (tabs.length > 0)
        {
          // Navigate to the new active tab (set by removeTab)
          const activeTab = tabs.find(t => t.id === activeTabId);
          if (activeTab && location.pathname !== activeTab.url)
          {
            navigate(activeTab.url);
          } else if (!activeTab)
          {
            // Fallback: navigate to the last tab if activeTabId doesn't match
            const lastTab = tabs[tabs.length - 1];
            if (lastTab)
            {
              setActiveTab(lastTab.id);
              navigate(lastTab.url);
            }
          }
        } else
        {
          // No tabs left, navigate to home if we're on a paper page
          if (location.pathname.startsWith('/papers/'))
          {
            navigate('/');
          }
        }
      }

      // Clear the pending removal after handling
      pendingRemovalRef.current = null;
    }
  }, [tabs, activeTabId, navigate, setActiveTab, location.pathname]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Context menu would go here - for now just show popover
  };

  // Early return AFTER all hooks
  if (tabs.length === 0)
  {
    return null;
  }

  return (
    <div className="relative mb-3 bg-transparent px-1 overflow-x-auto">
      <div className="relative flex items-end gap-0.5  min-h-[40px] before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-green-6">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => handleTabClick(tab)}
            onContextMenu={handleContextMenu}
            className={`
              relative flex items-center px-3 py-2 gap-1.5 overflow-hidden rounded-t-sm rounded-b-none border-x border-t cursor-pointer
              transition-colors min-w-0 max-w-[200px]
              ${activeTabId === tab.id
                ? 'bg-blue-14 border-blue-31 text-green-38 z-10 shadow-none'
                : 'bg-grayscale-8 border-green-6 text-green-34 hover:bg-green-4'
              }
            `}
          >
            <FileText
              className="h-4 w-4 flex-shrink-0 opacity-60 -ms-0.5"
              aria-hidden="true"
            />
            <span className="truncate flex-1 text-sm font-medium">
              {tab.title}
            </span>
            <button
              onClick={(e) => handleCloseTab(e, tab.id)}
              className="p-1 hover:bg-green-5 rounded-sm transition-colors flex-shrink-0 ml-1"
              aria-label="Close tab"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

