import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { SettingsSection, FieldLabel, StatusMessage, type SectionStatus } from './SettingsSection';

export function ProfileSection() {
  const { user, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [organization, setOrganization] = useState(user?.organization ?? '');
  const [department, setDepartment] = useState(user?.department ?? '');
  const [researchField, setResearchField] = useState(user?.research_field ?? '');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SectionStatus>(null);

  useEffect(() => {
    setDisplayName(user?.display_name ?? '');
    setOrganization(user?.organization ?? '');
    setDepartment(user?.department ?? '');
    setResearchField(user?.research_field ?? '');
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await updateProfile({
        display_name: displayName || undefined,
        organization: organization || undefined,
        department: department || undefined,
        research_field: researchField || undefined,
        bio: bio || undefined,
      });
      setStatus({ kind: 'ok', text: 'Profile updated' });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const initials = (user?.display_name || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <SettingsSection id="profile" title="Profile" caption="Manage your personal information">
      <div className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-(--border) bg-(--muted)">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.display_name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-subheading font-semibold text-(--muted-foreground)">{initials}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-body font-medium text-(--foreground)">{user?.display_name || '—'}</p>
            <p className="truncate text-caption text-(--muted-foreground)">{user?.email || '—'}</p>
            <p className="mt-0.5 text-caption uppercase tracking-wide text-(--muted-foreground)">
              {user?.role === 'admin' ? 'Administrator' : 'Member'}
            </p>
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="profile-display-name">Display name</FieldLabel>
            <Input
              id="profile-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="profile-email">Email</FieldLabel>
            <Input id="profile-email" value={user?.email ?? ''} type="email" disabled />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="profile-organization">Organization</FieldLabel>
              <Input
                id="profile-organization"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="profile-department">Department</FieldLabel>
              <Input
                id="profile-department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="profile-research-field">Research field</FieldLabel>
            <Input
              id="profile-research-field"
              value={researchField}
              onChange={(e) => setResearchField(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="profile-bio">Bio</FieldLabel>
            <Textarea
              id="profile-bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about your research interests"
            />
          </div>
        </div>

        <StatusMessage status={status} />

        <Button variant="primary" onClick={handleSave} loading={saving}>
          Save changes
        </Button>
      </div>
    </SettingsSection>
  );
}
