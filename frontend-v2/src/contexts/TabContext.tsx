import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';

export interface Tab {
  id: string;
  paperId: number;
  title: string;
  currentPage: number;
  zoomLevel: number;
  sidebarOpen: boolean;
  url: string;
  /** Which right-side panel tab (Details/Insights/Chat/...) this paper was last showing. */
  panelTab?: string;
}

interface TabContextType {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: (paperId: number, title: string, url: string) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: () => void;
}

const TabContext = createContext<TabContextType | undefined>(undefined);

function loadFromStorage(): { tabs: Tab[]; activeTabId: string | null } {
  try {
    const saved = localStorage.getItem('nexus-tabs');
    if (!saved) return { tabs: [], activeTabId: null };

    const parsed = JSON.parse(saved) as { tabs?: Tab[]; activeTabId?: string | null };
    const storedTabs = Array.isArray(parsed.tabs) ? parsed.tabs : [];
    const activePaperId = storedTabs.find((tab) => tab.id === parsed.activeTabId)?.paperId;
    const uniqueByPaper = new Map<number, Tab>();

    for (const tab of storedTabs) {
      if (!Number.isFinite(tab.paperId)) continue;
      uniqueByPaper.set(tab.paperId, { ...tab, id: `tab-paper-${tab.paperId}` });
    }

    const tabs = [...uniqueByPaper.values()].slice(-10);
    const activeTab = tabs.find((tab) => tab.paperId === activePaperId) ?? tabs.at(-1);
    return { tabs, activeTabId: activeTab?.id ?? null };
  } catch {
    // Ignore malformed or unavailable browser storage.
  }
  return { tabs: [], activeTabId: null };
}

export function TabProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>(() => loadFromStorage().tabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(() => loadFromStorage().activeTabId);

  const saveToStorage = useCallback((newTabs: Tab[], newActiveId: string | null) => {
    try {
      localStorage.setItem(
        'nexus-tabs',
        JSON.stringify({ tabs: newTabs.slice(-5), activeTabId: newActiveId })
      );
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    saveToStorage(tabs, activeTabId);
  }, [tabs, activeTabId, saveToStorage]);

  const addTab = useCallback(
    (paperId: number, title: string, url: string) => {
      setTabs((current) => {
        const existingTab = current.find((tab) => tab.paperId === paperId);
        if (existingTab) {
          setActiveTabId(existingTab.id);
          return current;
        }

        const newTabs = current.length >= 10 ? current.slice(1) : current;
        const newTab: Tab = {
          // Stable per-paper IDs make registration idempotent under React
          // Strict Mode, which intentionally replays mount effects in dev.
          id: `tab-paper-${paperId}`,
          paperId,
          title: title.length > 30 ? title.substring(0, 30) + '...' : title,
          currentPage: 1,
          zoomLevel: 1.0,
          sidebarOpen: true,
          url,
        };

        const updated = [...newTabs, newTab];
        setActiveTabId(newTab.id);
        saveToStorage(updated, newTab.id);
        return updated;
      });
    },
    [saveToStorage]
  );

  const removeTab = useCallback((tabId: string) => {
    setTabs((current) => {
      const removedIndex = current.findIndex((tab) => tab.id === tabId);
      const newTabs = current.filter((tab) => tab.id !== tabId);

      setActiveTabId((currentActiveId) => {
        if (currentActiveId !== tabId) return currentActiveId;
        if (newTabs.length === 0) return null;
        const nextIndex = removedIndex < newTabs.length ? removedIndex : removedIndex - 1;
        return newTabs[Math.max(0, nextIndex)]?.id ?? null;
      });

      return newTabs;
    });
  }, []);

  const setActiveTab = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId);
      saveToStorage(tabs, tabId);
    },
    [tabs, saveToStorage]
  );

  const updateTab = useCallback(
    (tabId: string, updates: Partial<Tab>) => {
      setTabs((current) => {
        const newTabs = current.map((tab) => (tab.id === tabId ? { ...tab, ...updates } : tab));
        saveToStorage(newTabs, activeTabId);
        return newTabs;
      });
    },
    [activeTabId, saveToStorage]
  );

  const closeOtherTabs = useCallback(
    (tabId: string) => {
      setTabs((current) => {
        const tabToKeep = current.find((tab) => tab.id === tabId);
        const newTabs = tabToKeep ? [tabToKeep] : [];
        setActiveTabId(tabId);
        saveToStorage(newTabs, tabId);
        return newTabs;
      });
    },
    [saveToStorage]
  );

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    saveToStorage([], null);
  }, [saveToStorage]);

  return (
    <TabContext.Provider
      value={{
        tabs,
        activeTabId,
        addTab,
        removeTab,
        setActiveTab,
        updateTab,
        closeOtherTabs,
        closeAllTabs,
      }}
    >
      {children}
    </TabContext.Provider>
  );
}

// The hook intentionally shares this context module with its provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useTabs() {
  const context = useContext(TabContext);
  if (context === undefined) {
    throw new Error('useTabs must be used within a TabProvider');
  }
  return context;
}
