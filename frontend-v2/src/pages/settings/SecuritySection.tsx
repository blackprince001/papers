import { useState } from 'react';
import { LogoutIcon, TrashIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { SettingsSection } from './SettingsSection';

export function SecuritySection() {
  const { logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      window.location.href = '/login';
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SettingsSection id="security" title="Security" caption="Manage your account security">
      <div className="rounded-xl border border-(--danger-border) p-4">
        <p className="mb-4 text-caption font-semibold uppercase tracking-widest text-(--danger)">
          Danger zone
        </p>
        <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-body font-medium text-(--foreground)">Sign out</p>
            <p className="text-caption text-(--muted-foreground)">End this session</p>
          </div>
          <Button
            variant="ghost"
            icon={<LogoutIcon size="sm" />}
            className="text-(--danger) hover:bg-(--danger-soft)"
            onClick={handleSignOut}
            loading={signingOut}
          >
            Sign out
          </Button>
        </div>
        <div className="flex flex-col items-start justify-between gap-3 opacity-60 sm:flex-row sm:items-center">
          <div>
            <p className="text-body font-medium text-(--foreground)">Delete account</p>
            <p className="text-caption text-(--muted-foreground)">Contact an administrator</p>
          </div>
          <Button
            variant="ghost"
            icon={<TrashIcon size="sm" />}
            className="text-(--danger) hover:bg-(--danger-soft)"
            disabled
          >
            Delete
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
