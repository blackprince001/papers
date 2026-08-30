import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { Skeleton } from './ui/Skeleton';
import { EmptyState } from './ui/EmptyState';
import { SetupIllustration } from '@/components/illustrations';
import { paperSharingApi, groupSharingApi, type SharePermission, type ShareRecipient } from '@/lib/api/sharing';
import { TrashIcon, UserPlusIcon } from '@/components/icons';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  resourceId: number;
  resourceType: 'paper' | 'group';
  resourceTitle: string;
}

export function ShareDialog({ open, onClose, resourceId, resourceType, resourceTitle }: ShareDialogProps) {
  const [emailInput, setEmailInput] = useState('');
  const [permission, setPermission] = useState<SharePermission>('viewer');
  const [feedback, setFeedback] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const sharingApi = resourceType === 'paper' ? paperSharingApi : groupSharingApi;
  const queryKey = [resourceType, resourceId, 'shares'];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => sharingApi.list(resourceId),
    enabled: open,
  });

  const shareMutation = useMutation({
    mutationFn: (emails: string[]) => sharingApi.share(resourceId, emails, permission),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey });
      setEmailInput('');
      const parts: string[] = [];
      if (result.shares.length) parts.push(`Shared with ${result.shares.length} user(s)`);
      if (result.missing_emails.length) parts.push(`Not found: ${result.missing_emails.join(', ')}`);
      if (result.skipped_emails.length) parts.push(`Skipped (self): ${result.skipped_emails.join(', ')}`);
      setFeedback(parts.join('. '));
    },
    onError: (err: Error) => setFeedback(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ userId, perm }: { userId: number; perm: SharePermission }) =>
      sharingApi.update(resourceId, userId, perm),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: number) => sharingApi.revoke(resourceId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const handleShare = () => {
    const emails = emailInput.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean);
    if (!emails.length) return;
    setFeedback(null);
    shareMutation.mutate(emails);
  };

  const shares = data?.shares ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Share "${resourceTitle}"`}
      size="xl"
      className="sm:max-w-3xl"
    >
      <div className="space-y-4">
        {/* Add recipients */}
        <div className="flex flex-col gap-2">
          <textarea
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleShare();
              }
            }}
            placeholder="Enter email addresses, separated by commas, spaces, or new lines"
            rows={4}
            className="w-full min-h-[6rem] px-3 py-2 text-body border border-(--border) rounded-interactive bg-(--white) text-(--foreground) placeholder:text-(--muted-foreground) focus:outline-none focus:ring-1 focus:ring-(--ring) resize-y leading-relaxed"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="w-32 shrink-0">
              <Select
                value={permission}
                onChange={(e) => setPermission(e.target.value as SharePermission)}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </Select>
            </div>
            <Button
              icon={<UserPlusIcon size="sm" />}
              onClick={handleShare}
              loading={shareMutation.isPending}
              disabled={!emailInput.trim()}
            >
              Share
            </Button>
          </div>
        </div>

        {feedback && (
          <p className="text-caption text-(--muted-foreground)">{feedback}</p>
        )}

        {/* Current shares */}
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-1.5 px-2">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-52" />
                </div>
                <Skeleton className="h-8 w-28" />
              </div>
            ))}
          </div>
        ) : shares.length === 0 ? (
          <EmptyState
            size="panel"
            illustration={SetupIllustration}
            title="Not shared with anyone yet"
            description="People you share with will appear here."
          />
        ) : (
          <div className="space-y-2">
            <p className="text-caption font-medium text-(--muted-foreground)">Shared with</p>
            {shares.map((share: ShareRecipient) => (
              <div key={share.user_id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-interactive hover:bg-(--muted)">
                <div className="flex flex-col min-w-0">
                  <span className="text-body font-medium text-(--foreground) truncate">{share.display_name}</span>
                  <span className="text-caption text-(--muted-foreground) truncate">{share.email}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-28">
                    <Select
                      value={share.permission}
                      onChange={(e) => updateMutation.mutate({ userId: share.user_id, perm: e.target.value as SharePermission })}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </Select>
                  </div>
                  <button
                    onClick={() => revokeMutation.mutate(share.user_id)}
                    className="p-1 rounded-interactive text-(--muted-foreground) hover:text-(--destructive) hover:bg-(--destructive)/10 transition-colors"
                    aria-label={`Remove ${share.display_name}`}
                  >
                    <TrashIcon size="sm" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
