import { useState, useEffect, useRef, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import ChatPanel from "./ChatPanel";
import { TabBar } from "./TabBar";
import { ReaderProvider } from "@/contexts/ReaderContext";
import { ChatControllerProvider } from "@/contexts/ChatControllerContext";
import { useTabs } from "@/contexts/TabContext";

const SIDEBAR_MIN = 57;
const SIDEBAR_SNAP_CLOSE = 154; // below this → snap to collapsed icon-only mode
const SIDEBAR_DEFAULT = 286;
const SIDEBAR_MAX = 396;

const CHAT_MIN = 57; // collapsed sliver width
const CHAT_SNAP_CLOSE = 132; // below this → snap closed
const CHAT_DEFAULT = 462;
const CHAT_MAX = 748;

function ResizeDivider({ onDrag }: { onDrag: (dx: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    lastX.current = e.clientX;
    e.preventDefault();
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      onDrag(e.clientX - lastX.current);
      lastX.current = e.clientX;
    };
    const onMouseUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onDrag]);

  return (
    <div
      onMouseDown={onMouseDown}
      className="hidden md:flex w-1 shrink-0 cursor-col-resize group relative z-10 items-center justify-center py-4"
    >
      <div className="absolute inset-y-0 -left-2 -right-2" />
      <div className="h-full w-px rounded-full bg-transparent transition-colors duration-150" />
      <div className="absolute top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1 h-1 rounded-full bg-(--mid-gray) opacity-80"
          />
        ))}
      </div>
    </div>
  );
}

export default function Layout() {
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [chatWidth, setChatWidth] = useState(CHAT_MAX);
  const [chatPanelOpen, setChatPanelOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { tabs, activeTabId, updateTab } = useTabs();

  // The right-side panel tab (Details/Insights/Chat/...) is remembered per
  // paper tab so switching tabs doesn't reset which panel you were viewing.
  const activePaperTab = tabs.find((t) => t.id === activeTabId);
  const activeTab = activePaperTab?.panelTab ?? "details";
  const setActiveTab = useCallback(
    (tab: string) => {
      if (activeTabId) updateTab(activeTabId, { panelTab: tab });
    },
    [activeTabId, updateTab],
  );

  // Only the reader route itself gets the tab bar + chat side panel. Sub-routes
  // like /papers/:id/chat are standalone pages and must not inherit that chrome.
  const isPaperDetailPage = /^\/papers\/\d+\/?$/.test(location.pathname);

  const paperRouteMatch = location.pathname.match(
    /^\/papers\/(\d+)(?:\/chat)?\/?$/,
  );
  const chatPaperId = paperRouteMatch ? parseInt(paperRouteMatch[1]) : null;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isPaperDetailPage) {
      setChatPanelOpen(true);
      setChatWidth(CHAT_DEFAULT);
    }
  }, [isPaperDetailPage, location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const onSidebarDrag = useCallback((dx: number) => {
    setSidebarWidth((w) => {
      const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w + dx));
      if (next <= SIDEBAR_SNAP_CLOSE) {
        setTimeout(() => setSidebarWidth(SIDEBAR_MIN), 0);
        return SIDEBAR_MIN;
      }
      return next;
    });
  }, []);

  // Chat drag: snap closed when dragged narrow enough
  const onChatDrag = useCallback((dx: number) => {
    setChatWidth((prev) => {
      const next = Math.max(CHAT_MIN, Math.min(CHAT_MAX, prev - dx));
      if (next <= CHAT_SNAP_CLOSE) {
        // Defer the close so we don't setState during render
        setTimeout(() => setChatPanelOpen(false), 0);
        return CHAT_DEFAULT; // reset for next open
      }
      return next;
    });
  }, []);

  const sidebarCollapsed = sidebarWidth <= SIDEBAR_MIN + 20;

  const workspace = (
    <>
      {/* === Center: Navbar + Page === */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden rounded-(--panel-radius) border border-(--panel-border) bg-(--panel-surface) shadow-(--shadow-panel) backdrop-blur-sm">
        <Navbar
          onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
          showChatToggle={isPaperDetailPage && !chatPanelOpen}
          onChatToggle={() => {
            setChatPanelOpen(true);
            setChatWidth(CHAT_DEFAULT);
          }}
        />
        {isPaperDetailPage && <TabBar />}
        <main
          className={`flex-1 w-full bg-(--panel-surface) ${isPaperDetailPage ? "overflow-hidden" : "overflow-auto"}`}
        >
          <Outlet
            context={{
              chatPanelOpen,
              setChatPanelOpen,
              activeTab,
              setActiveTab,
            }}
          />
        </main>
      </div>

      {/* === Chat Panel — right column, only on paper detail === */}
      {isPaperDetailPage && chatPanelOpen && (
        <>
          {/* Chat resize divider */}
          <ResizeDivider onDrag={onChatDrag} />
          <div
            className="shrink-0 hidden md:flex min-h-0"
            style={{ width: chatWidth }}
          >
            <ChatPanel
              isOpen={chatPanelOpen}
              onToggle={() => {
                setChatPanelOpen(false);
                setChatWidth(CHAT_DEFAULT);
              }}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />
          </div>
        </>
      )}
    </>
  );

  return (
    <ReaderProvider>
      <div
        className="w-full h-dvh flex overflow-hidden bg-(--background) p-1 gap-(--panel-gap)"
        style={{
          backgroundImage:
            'linear-gradient(180deg, color-mix(in srgb, var(--sky-blue) 5%, transparent) 0%, transparent 26%)',
        }}
      >
        {/* === Desktop Sidebar — left column === */}
        <div
          className="hidden md:flex shrink-0 min-h-0"
          style={{ width: sidebarWidth }}
        >
          <Sidebar
            isOpen={!sidebarCollapsed}
            onToggle={() =>
              setSidebarWidth(() =>
                sidebarCollapsed ? SIDEBAR_DEFAULT : SIDEBAR_MIN,
              )
            }
          />
        </div>

        {/* Sidebar resize divider */}
        <ResizeDivider onDrag={onSidebarDrag} />

        {/* === Mobile Sidebar Overlay (scrim) === */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-60 bg-(--overlay-scrim) md:hidden animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* === Mobile Sidebar Drawer === */}
        <div
          className={`fixed inset-y-0 left-0 z-70 w-60 p-1 transform transition-transform duration-300 ease-out md:hidden ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar isOpen={true} onToggle={() => setMobileMenuOpen(false)} />
        </div>

        {chatPaperId != null ? (
          <ChatControllerProvider key={chatPaperId} paperId={chatPaperId}>
            {workspace}
          </ChatControllerProvider>
        ) : (
          workspace
        )}
      </div>
    </ReaderProvider>
  );
}
