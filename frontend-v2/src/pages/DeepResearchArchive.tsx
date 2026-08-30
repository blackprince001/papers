import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  SearchIcon,
  SpinnerIcon,
  TrashIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog, useConfirmDialog } from '@/components/ConfirmDialog';
import { deepResearchApi, type DeepResearchSession } from '@/lib/api/deepResearch';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActivityIllustration } from '@/components/illustrations';
import { toastError } from '@/lib/utils/toast';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const DEEP_RESEARCH_MUTATIONS_ENABLED =
  import.meta.env.VITE_DEEP_RESEARCH_MUTATIONS_ENABLED !== 'false';

const PAGE_SIZE = 20;

const STATUS: Record<string, { label: string; dot: string }> = {
  queued: { label: 'Queued', dot: 'bg-(--muted-foreground)' },
  planning: { label: 'Planning', dot: 'bg-(--foreground) animate-pulse' },
  searching: { label: 'Searching', dot: 'bg-(--foreground) animate-pulse' },
  reading: { label: 'Reading', dot: 'bg-(--foreground) animate-pulse' },
  synthesizing: { label: 'Synthesizing', dot: 'bg-(--foreground) animate-pulse' },
  verifying: { label: 'Verifying', dot: 'bg-(--foreground) animate-pulse' },
  running: { label: 'Researching', dot: 'bg-(--foreground) animate-pulse' },
  cancel_requested: { label: 'Cancelling', dot: 'bg-amber-500 animate-pulse' },
  cancelled: { label: 'Cancelled', dot: 'bg-(--muted-foreground)' },
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
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['deep-research-archive', search, offset],
    queryFn: () => deepResearchApi.archive(search, PAGE_SIZE, offset),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deepResearchApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deep-research-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['deep-research-archive'] });
    },
    onError: () => toastError('Could not delete research run'),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: number) => deepResearchApi.resume(id),
    onSuccess: (_d, id) => navigate(`/deep-research?id=${id}`),
  });

  const open = (session: DeepResearchSession) => navigate(`/deep-research?id=${session.id}`);
  const sessions = data?.items ?? [];
  const hasPrevious = offset > 0;
  const hasNext = data?.has_more ?? false;

  return (
    <div className="max-w-content mx-auto px-6 py-8">
      <div className="mb-8">
        <h1>Research Archive</h1>
        <p className="text-btn text-(--muted-foreground) mt-1">Your past deep-research runs.</p>
      </div>

      <label className="mb-5 flex items-center gap-2 rounded-xl border border-(--border) bg-(--card) px-3 h-10 focus-within:border-(--foreground)/30">
        <SearchIcon size="sm" className="text-(--muted-foreground) shrink-0" />
        <span className="sr-only">Search research archive</span>
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
          placeholder="Search research…"
          aria-label="Search research archive"
          className="min-w-0 flex-1 bg-transparent text-code text-(--foreground) placeholder:text-(--muted-foreground) outline-none"
        />
        {isFetching && !isLoading && (
          <SpinnerIcon size="sm" className="text-(--muted-foreground) animate-spin" />
        )}
      </label>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="p-4 rounded-xl border border-(--border) space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-(--border) bg-(--card) p-6 text-center">
          <p className="text-body text-(--foreground)">Could not load the research archive.</p>
          <Button variant="outlined" size="sm" className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          size="page"
          illustration={ActivityIllustration}
          title={search ? 'No matching research runs' : 'No research runs yet'}
          description={search ? 'Try a different search.' : 'Start a run from the Deep Research page.'}
        />
      ) : (
        <div className="space-y-2.5">
          {sessions.map((session, i) => {
            const status = STATUS[session.status] ?? { label: session.status, dot: 'bg-(--muted-foreground)' };
            return (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.4), ease: EASE_OUT }}
                className="group flex items-center justify-between gap-4 rounded-xl border border-(--border) bg-(--card) px-4 py-3 transition-colors duration-150 hover:border-(--foreground)/20"
              >
                <button
                  type="button"
                  onClick={() => open(session)}
                  className="flex-1 min-w-0 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
                >
                  <p className="text-code font-medium text-(--foreground) truncate">
                    {session.title || session.question}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1.5 text-caption text-(--muted-foreground)">
                      <span className={cn('w-1.5 h-1.5 rounded-full', status.dot)} />
                      {status.label}
                    </span>
                    <span className="flex items-center gap-1 text-caption text-(--muted-foreground)">
                      <ClockIcon size="xs" />
                      {formatDate(session.updated_at)}
                    </span>
                  </div>
                </button>
                <div
                  className="flex items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {session.status === 'paused' && (
                    <Button
                      variant="outlined"
                      className="h-8! text-caption!"
                      disabled={resumeMutation.isPending || !DEEP_RESEARCH_MUTATIONS_ENABLED}
                      onClick={() => resumeMutation.mutate(session.id)}
                    >
                      {DEEP_RESEARCH_MUTATIONS_ENABLED ? 'Resume' : 'Resume unavailable'}
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
                      <SpinnerIcon size="sm" duotone={false} className="animate-spin" />
                    ) : (
                      <TrashIcon size="sm" />
                    )}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {data && data.total > 0 && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-caption text-(--muted-foreground)">
            Showing {offset + 1}–{Math.min(offset + sessions.length, data.total)} of {data.total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              icon={<ChevronLeftIcon size="sm" />}
              aria-label="Previous archive page"
              disabled={!hasPrevious || isFetching}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              icon={<ChevronRightIcon size="sm" />}
              aria-label="Next archive page"
              disabled={!hasNext || isFetching}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
            />
          </div>
        </div>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
