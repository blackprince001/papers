import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { TabBar } from './TabBar';
import { TabProvider } from '@/contexts/TabContext';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();

  // Only show TabBar when on paper detail pages
  const isPaperDetailPage = /^\/papers\/\d+$/.test(location.pathname);

  return (
    <TabProvider>
      <div className="w-full h-screen flex overflow-hidden">
        <div className="flex-shrink-0" style={{ width: sidebarOpen ? '350px' : '60px' }}>
          <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
        </div>
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Navbar />
          {isPaperDetailPage && <TabBar />}
          <main className="flex-1 w-full bg-background rounded-lg overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </TabProvider>
  );
}

