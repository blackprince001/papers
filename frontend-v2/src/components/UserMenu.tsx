import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronUpIcon, LogoutIcon, SettingsIcon, ShieldIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface UserMenuProps {
  isOpen: boolean; // sidebar expanded state
}

export default function UserMenu({ isOpen }: UserMenuProps) {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const initials = user?.display_name
    ? user.display_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        title={!isOpen ? (user?.display_name ?? 'Profile') : undefined}
        className={cn(
          'flex items-center gap-2.5 rounded-lg transition-colors duration-150 select-none w-full',
          isOpen ? 'h-9 px-2.5' : 'h-8 w-8 justify-center mx-auto',
          'text-(--muted-foreground) hover:bg-(--muted) hover:text-(--foreground)',
        )}
      >
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="" className="w-5 h-5 rounded-full shrink-0 object-cover" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-(--muted) border border-(--border) flex items-center justify-center shrink-0 text-[0.5625rem] font-semibold">
            {initials}
          </div>
        )}
        {isOpen && (
          <>
            <span className="text-code truncate flex-1 text-left">{user?.display_name ?? 'User'}</span>
            {isAdmin && (
              <span className="text-[0.5625rem] font-semibold uppercase tracking-wide text-(--warning) bg-(--warning-soft) border border-(--warning-border) rounded px-1 shrink-0">
                admin
              </span>
            )}
            <ChevronUpIcon size="xs" className="shrink-0 opacity-50" />
          </>
        )}
      </button>

      {menuOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-48 bg-(--white) border border-(--border) rounded-xl shadow-lg py-1 z-50">
          {isOpen && (
            <div className="px-3 py-2 border-b border-(--border) mb-1">
              <p className="text-caption font-medium text-(--foreground) truncate">{user?.display_name}</p>
              <p className="text-micro text-(--muted-foreground) truncate">{user?.email}</p>
            </div>
          )}
          <Link
            to="/settings"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 h-8 text-body text-(--foreground) hover:bg-(--muted) transition-colors"
          >
            <SettingsIcon size="sm" /> Settings
          </Link>
          {isAdmin && (
            <Link
              to="/admin/users"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-3 h-8 text-body text-(--foreground) hover:bg-(--muted) transition-colors"
            >
              <ShieldIcon size="sm" /> User Management
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 h-8 text-body text-(--danger) hover:bg-(--danger-soft) transition-colors w-full text-left"
          >
            <LogoutIcon size="sm" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
