import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { TabBar } from './TabBar';
import { TabProvider } from '@/contexts/TabContext';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Only show TabBar when on paper detail pages
  const isPaperDetailPage = /^\/papers\/\d+$/.test(location.pathname);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu on window resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768)
      {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <TabProvider>
      <div className="w-full h-dvh flex overflow-hidden">
        {/* Desktop Sidebar */}
        <div
          className="hidden md:flex flex-shrink-0 transition-all duration-300"
          style={{ width: sidebarOpen ? '280px' : '60px' }}
        >
          <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
        </div>

        {/* Mobile Sidebar Overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-[60] bg-black/50 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Mobile Sidebar Drawer */}
        <div
          className={`fixed inset-y-0 left-0 z-[70] w-[280px] transform transition-transform duration-300 ease-out md:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
        >
          <Sidebar
            isOpen={true}
            onToggle={() => setMobileMenuOpen(false)}
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Navbar onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
          {isPaperDetailPage && <TabBar />}
          <main className="flex-1 w-full bg-background overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </TabProvider>
  );
}
