import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SearchIcon, ShieldIcon, ShieldOffIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon } from '@/components/icons';
import { usersApi } from '@/lib/api/usersApi';
import type { User } from '@/lib/api/authApi';
import { toastSuccess as toastS, toastError as toastE } from '@/lib/utils/toast';
import { Select } from '@/components/ui/Select';
import { formatDistanceToNow } from 'date-fns';

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-[0.625rem] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${role === 'admin'
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : 'text-(--muted-foreground) bg-(--muted) border-(--border)'
      }`}>
      {role}
    </span>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${active ? 'bg-green-500' : 'bg-(--muted-foreground)'}`} />
  );
}

function UserDetailModal({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => usersApi.get(userId),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-(--white) border border-(--border) rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        {isLoading || !data ? (
          <div className="h-32 flex items-center justify-center text-body text-(--muted-foreground)">Loading…</div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              {data.avatar_url ? (
                <img src={data.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-(--muted) flex items-center justify-center text-body font-semibold">
                  {data.display_name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-medium text-body text-(--foreground)">{data.display_name}</p>
                <p className="text-caption text-(--muted-foreground)">{data.email}</p>
              </div>
            </div>
            <div className="space-y-2 text-body">
              {[
                ['Organization', data.organization],
                ['Department', data.department],
                ['Research Field', data.research_field],
                ['Role', data.role],
                ['Status', data.is_active ? 'Active' : 'Inactive'],
                ['Logins', String(data.login_count)],
                ['Papers uploaded', String(data.papers_uploaded)],
                ['Annotations', String(data.annotations_count)],
                ['Reading time', `${data.total_reading_minutes} min`],
                ['Last login', data.last_login_at ? formatDistanceToNow(new Date(data.last_login_at), { addSuffix: true }) : 'Never'],
              ].map(([label, value]) => value && (
                <div key={label} className="flex justify-between">
                  <span className="text-(--muted-foreground)">{label}</span>
                  <span className="text-(--foreground) font-medium">{value}</span>
                </div>
              ))}
            </div>
            <button onClick={onClose} className="mt-5 w-full h-8 rounded-lg border border-(--border) text-body hover:bg-(--muted) transition-colors">
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function UserManagement() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [sortField, setSortField] = useState<keyof User>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', search, roleFilter, activeFilter],
    queryFn: () => usersApi.list({ search: search || undefined, role: roleFilter || undefined, is_active: activeFilter }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { is_active?: boolean; role?: 'user' | 'admin' } }) =>
      usersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toastS('User updated'); },
    onError: () => toastE('Failed to update user'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toastS('User deleted'); },
    onError: () => toastE('Failed to delete user'),
  });

  const toggleSort = (field: keyof User) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: keyof User }) =>
    sortField === field
      ? sortDir === 'asc' ? <ChevronUpIcon size="xs" /> : <ChevronDownIcon size="xs" />
      : null;

  const sorted = [...users].sort((a, b) => {
    const av = a[sortField] ?? '';
    const bv = b[sortField] ?? '';
    const cmp = String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-subsection font-semibold text-(--foreground)">User Management</h1>
        <p className="text-body text-(--muted-foreground) mt-0.5">{users.length} users</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-(--muted-foreground)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-(--border) bg-(--background) text-body focus:outline-none focus:ring-2 focus:ring-(--ring)"
          />
        </div>
        <div className="w-40">
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </Select>
        </div>
        <div className="w-40">
          <Select
            value={activeFilter === undefined ? '' : String(activeFilter)}
            onChange={(e) => setActiveFilter(e.target.value === '' ? undefined : e.target.value === 'true')}
          >
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="border border-(--border) rounded-xl overflow-hidden">
        <table className="w-full text-body">
          <thead className="bg-(--muted) border-b border-(--border)">
            <tr>
              {(['display_name', 'email', 'organization', 'role'] as const).map((f) => (
                <th
                  key={f}
                  onClick={() => toggleSort(f)}
                  className="text-left px-4 py-2.5 text-caption font-semibold text-(--muted-foreground) uppercase tracking-wide cursor-pointer hover:text-(--foreground) select-none"
                >
                  <span className="flex items-center gap-1">{f.replace('_', ' ')} <SortIcon field={f} /></span>
                </th>
              ))}
              <th className="text-left px-4 py-2.5 text-caption font-semibold text-(--muted-foreground) uppercase tracking-wide">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-(--border)">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-body text-(--muted-foreground)">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-body text-(--muted-foreground)">No users found</td></tr>
            ) : sorted.map((user) => (
              <tr key={user.id} className="hover:bg-(--muted) transition-colors">
                <td className="px-4 py-3">
                  <button onClick={() => setSelectedUser(user.id)} className="font-medium text-(--foreground) hover:underline text-left">
                    {user.display_name}
                  </button>
                </td>
                <td className="px-4 py-3 text-(--muted-foreground)">{user.email}</td>
                <td className="px-4 py-3 text-(--muted-foreground)">{user.organization ?? '—'}</td>
                <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                <td className="px-4 py-3"><StatusDot active={user.is_active} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => updateMutation.mutate({ id: user.id, data: { is_active: !user.is_active } })}
                      title={user.is_active ? 'Deactivate' : 'Activate'}
                      className="p-1.5 rounded-lg hover:bg-(--border) transition-colors text-(--muted-foreground) hover:text-(--foreground)"
                    >
                      {user.is_active ? <ShieldOffIcon size="sm" /> : <ShieldIcon size="sm" />}
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete ${user.display_name}?`)) deleteMutation.mutate(user.id); }}
                      title="Delete user"
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-(--muted-foreground) hover:text-red-600"
                    >
                      <TrashIcon size="sm" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && <UserDetailModal userId={selectedUser} onClose={() => setSelectedUser(null)} />}
    </div>
  );
}
