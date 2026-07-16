import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArchiveIcon, ClockIcon, TrashIcon, SpinnerIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog, useConfirmDialog } from '@/components/ConfirmDialog';
import { deepResearchApi, type DeepResearchSession } from '@/lib/api/deepResearch';
import { cn } from '@/lib/utils';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const STATUS: Record<string, { label: string; dot: string }> = {
  running: { label: 'Researching', dot: 'bg-(--foreground) animate-pulse' },
  paused: { label: 'Paused', dot: 'bg-amber-500' },
  completed: { label: 'Complete', dot: 'bg-(--foreground)' },
  failed: { label: 'Failed', dot: 'bg-(--destructive)' },
};

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export default function DeepResearchArchive() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmDialog();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['deep-research-sessions'],
    queryFn: () => deepResearchApi.list(50, 0),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deepResearchApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deep-research-sessions'] }),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: number) => deepResearchApi.resume(id),
    onSuccess: (_d, id) => navigate(`/deep-research?id=${id}`),
  });

  const open = (session: DeepResearchSession) => navigate(`/deep-research?id=${session.id}`);

  return (
    <div className="max-w-content mx-auto px-6 py-8">
      <div className="mb-8">
        <h1>Research Archive</h1>
        <p className="text-btn text-(--muted-foreground) mt-1">Your past deep-research runs.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="p-4 rounded-xl border border-(--border) space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </div>
      ) : !sessions || sessions.length === 0 ? (
        <div className="text-center py-16">
          <ArchiveIcon size={40} className="text-(--muted-foreground) mx-auto mb-3 opacity-40" />
          <p className="text-body text-(--muted-foreground)">No research runs yet.</p>
          <p className="text-code text-(--muted-foreground) mt-1">
            Start a run from the Deep Research page.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sessions.map((session, i) => {
            const status = STATUS[session.status] ?? STATUS.completed;
            return (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.4), ease: EASE_OUT }}
                onClick={() => open(session)}
                className="group flex items-center justify-between gap-4 rounded-xl border border-(--border) bg-(--card) px-4 py-3 cursor-pointer transition-colors duration-150 hover:border-(--foreground)/20"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-code font-medium text-(--foreground) truncate">
                    {session.title || session.question}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1.5 text-caption text-(--muted-foreground)">
                      <span className={cn('w-1.5 h-1.5 rounded-full', status.dot)} />
                      {status.label}
                    </span>
                    <span className="flex items-center gap-1 text-caption text-(--muted-foreground)">
                      <ClockIcon size={11} />
                      {formatDate(session.updated_at)}
                    </span>
                  </div>
                </div>
                <div
                  className="flex items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {session.status === 'paused' && (
                    <Button
                      variant="outlined"
                      className="h-8! text-caption!"
                      disabled={resumeMutation.isPending}
                      onClick={() => resumeMutation.mutate(session.id)}
                    >
                      Resume
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="h-8! w-8! p-0! text-(--muted-foreground) hover:text-(--destructive) opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    disabled={deleteMutation.isPending}
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Delete research run?',
                        description:
                          'This permanently removes this run and its report. This can’t be undone.',
                        confirmLabel: 'Delete',
                        destructive: true,
                      });
                      if (ok) deleteMutation.mutate(session.id);
                    }}
                  >
                    {deleteMutation.isPending && deleteMutation.variables === session.id ? (
                      <SpinnerIcon size={15} className="animate-spin" />
                    ) : (
                      <TrashIcon size={15} />
                    )}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
