import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, addDays, subMonths, addMonths, isToday, isFuture, parseISO, startOfMonth } from 'date-fns';
import { motion } from 'motion/react';
import { ExternalLinkIcon, ThumbsUpIcon, ChatIcon, RefreshIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, ChevronUpIcon, SparklesIcon, BookmarkPlusIcon, CalendarIcon } from '@/components/icons';
import { PaperCoverPlaceholder } from '@/components/ui/PaperCoverPlaceholder';
import { huggingfaceApi, type HFPaperItem } from '@/lib/api/huggingface';
import { Button } from '@/components/ui/Button';
import { getPaperTheme } from '@/lib/paper-themes';
import { AddToLibraryDialog } from '@/components/discovery/AddToLibraryDialog';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';

type ViewMode = 'daily' | 'monthly';

function getTodayString() {
  return format(new Date(), 'yyyy-MM-dd');
}

function HFPaperCard({ paper, index = 0 }: { paper: HFPaperItem; index?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const theme = useMemo(() => {
    const hash = paper.paper.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return getPaperTheme(hash);
  }, [paper.paper.id]);

  const authorNames = paper.paper.authors.filter((a) => !a.hidden).slice(0, 4).map((a) => a.name).join(', ');
  const hasMoreAuthors = paper.paper.authors.filter((a) => !a.hidden).length > 4;
  const paperUrl = paper.paperUrl || `https://huggingface.co/papers/${paper.paper.id}`;
  const summary = paper.paper.ai_summary || paper.summary || paper.paper.summary;

  return (
    <>
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut', delay: index * 0.03 }}
      className="rounded-2xl border overflow-hidden paper-card-hover flex flex-col"
      style={{ backgroundColor: theme.bg, borderColor: theme.border, '--card-action': theme.action } as React.CSSProperties}
    >
      {/* Header strip: stats + add-to-library */}
      <div className="flex items-center justify-between gap-1.5 px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded text-caption font-semibold flex items-center gap-1" style={{ backgroundColor: theme.accent, color: theme.text }}>
            <ThumbsUpIcon size="xs" />{paper.paper.upvotes}
          </span>
          {paper.numComments > 0 && (
            <span className="px-2 py-0.5 rounded text-caption font-semibold flex items-center gap-1" style={{ backgroundColor: theme.accent, color: theme.text }}>
              <ChatIcon size="xs" />{paper.numComments}
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setShowDialog(true); }}
          className="p-1.5 rounded transition-colors hover:bg-black/10"
          title="Add to library"
          style={{ color: theme.text }}
        >
          <BookmarkPlusIcon size="sm" />
        </button>
      </div>

      {/* Inset content area: cover left, details right */}
      <div className="rounded-t-xl border-t p-4 flex-1 flex gap-3.5" style={{ backgroundColor: theme.accent, borderColor: theme.border }}>
        {/* Cover thumbnail */}
        <div
          className="w-20 shrink-0 self-start aspect-[0.7727] rounded-lg overflow-hidden border shadow-xs"
          style={{ borderColor: theme.border, backgroundColor: theme.bg }}
        >
          {paper.thumbnail && !thumbFailed ? (
            <img
              src={paper.thumbnail}
              alt=""
              className="size-full object-cover"
              draggable={false}
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <PaperCoverPlaceholder theme={theme.name} />
          )}
        </div>

        <div className="min-w-0 flex-1">
        <p className="text-caption font-medium mb-2 truncate opacity-60" style={{ color: theme.text }}>
          {paper.organization && <>{paper.organization.fullname} · </>}
          {authorNames}{hasMoreAuthors && ' et al.'}
        </p>

        <h4 className="text-body font-semibold leading-snug line-clamp-2 mb-2" style={{ color: theme.text }}>
          {paper.title}
        </h4>

        {summary && (
          <div className="mb-3">
            <p className={`text-caption leading-relaxed opacity-75 ${isExpanded ? '' : 'line-clamp-2'}`} style={{ color: theme.text }}>
              {summary}
            </p>
            {summary.length > 150 && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                className="flex items-center gap-1 mt-1 text-caption font-medium opacity-50 hover:opacity-80 transition-opacity"
                style={{ color: theme.text }}
              >
                {isExpanded ? <><ChevronUpIcon size="xs" />Show less</> : <><ChevronDownIcon size="xs" />Read more</>}
              </button>
            )}
          </div>
        )}

        {paper.paper.ai_keywords && paper.paper.ai_keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {paper.paper.ai_keywords.slice(0, 3).map((kw, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-micro font-semibold rounded" style={{ backgroundColor: theme.bg, color: theme.text }}>
                <SparklesIcon size="xs" />{kw}
              </span>
            ))}
            {paper.paper.ai_keywords.length > 3 && (
              <span className="text-micro opacity-40 self-center" style={{ color: theme.text }}>+{paper.paper.ai_keywords.length - 3}</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: theme.border }}>
          <div className="flex items-center gap-3 text-caption opacity-50" style={{ color: theme.text }}>
            {paper.paper.githubRepo && (
              <a href={paper.paper.githubRepo} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:opacity-100 transition-opacity">
                GitHub{paper.paper.githubStars !== undefined && ` ⭐${paper.paper.githubStars}`}
              </a>
            )}
            {paper.paper.projectPage && (
              <a href={paper.paper.projectPage} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 hover:opacity-100 transition-opacity">
                <ExternalLinkIcon size="xs" />Project
              </a>
            )}
          </div>
          <a href={paperUrl} target="_blank" rel="noopener noreferrer" className="text-caption font-semibold opacity-60 hover:opacity-100 transition-opacity" style={{ color: theme.text }}>
            View paper →
          </a>
        </div>
        </div>
      </div>
    </motion.article>

      {showDialog && (
        <AddToLibraryDialog
          paper={{ title: paper.title, url: paperUrl }}
          onClose={() => setShowDialog(false)}
        />
      )}
    </>
  );
}

export default function HuggingFacePapers() {
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const parsedDate = parseISO(selectedDate);
  const isTodaySelected = isToday(parsedDate);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['huggingface-papers', selectedDate],
    queryFn: () => huggingfaceApi.fetchDailyPapers(selectedDate),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Daily nav
  const goBack = () => setSelectedDate(format(subDays(parsedDate, 1), 'yyyy-MM-dd'));
  const goForward = () => { const next = addDays(parsedDate, 1); if (!isFuture(next)) setSelectedDate(format(next, 'yyyy-MM-dd')); };

  // Monthly nav — jump to first of month
  const goMonthBack = () => setSelectedDate(format(startOfMonth(subMonths(parsedDate, 1)), 'yyyy-MM-dd'));
  const goMonthForward = () => {
    const next = startOfMonth(addMonths(parsedDate, 1));
    if (!isFuture(next)) setSelectedDate(format(next, 'yyyy-MM-dd'));
  };

  const dateLabel = viewMode === 'daily'
    ? format(parsedDate, 'EEEE, MMMM d, yyyy')
    : format(parsedDate, 'MMMM yyyy');

  return (
    <div className="max-w-240 mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6 sm:mb-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="tracking-tight">Daily Papers</h1>
          </div>
          <p className="text-body text-(--muted-foreground)">Community-curated research from Hugging Face</p>
        </div>
        <Button
          variant="secondary"
          icon={<ExternalLinkIcon size="sm" />}
          className="h-9! text-code px-2.5 sm:px-3 shrink-0"
          onClick={() => window.open('https://huggingface.co/papers', '_blank')}
          aria-label="View on Hugging Face"
        >
          <span className="hidden sm:inline">View on HF</span>
        </Button>
      </div>

      {/* View mode + Date Navigation */}
      <div className="bg-(--card) border border-(--border) rounded-xl p-3 sm:p-4 mb-6">
        {/* View mode toggle */}
        <div className="flex items-center gap-2 mb-4">
          {(['daily', 'monthly'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-medium border transition-colors',
                viewMode === mode
                  ? 'bg-(--foreground) text-(--white) border-(--foreground)'
                  : 'bg-transparent text-(--muted-foreground) border-(--border) hover:text-(--foreground)'
              )}
            >
              <CalendarIcon size="sm" />
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        {/* Date nav */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-body font-semibold text-(--foreground)">{dateLabel}</span>
            {isTodaySelected && (
              <span className="px-2 py-0.5 bg-(--muted) text-(--muted-foreground) text-caption font-medium rounded border border-(--border)">Today</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              className="h-8! px-2! sm:px-3! text-caption!"
              icon={<ChevronLeftIcon size="sm" />}
              onClick={viewMode === 'daily' ? goBack : goMonthBack}
              aria-label={viewMode === 'daily' ? 'Previous day' : 'Previous month'}
            >
              <span className="hidden sm:inline">{viewMode === 'daily' ? 'Prev' : 'Prev Month'}</span>
            </Button>
            {!isTodaySelected && (
              <Button variant="secondary" className="h-8! px-2! sm:px-3! text-caption!" onClick={() => setSelectedDate(getTodayString())}>
                {viewMode === 'daily' ? 'Today' : 'This Month'}
              </Button>
            )}
            <Button
              variant="secondary"
              className="h-8! px-2! sm:px-3! text-caption!"
              disabled={isTodaySelected}
              onClick={viewMode === 'daily' ? goForward : goMonthForward}
              aria-label={viewMode === 'daily' ? 'Next day' : 'Next month'}
            >
              <span className="hidden sm:inline">{viewMode === 'daily' ? 'Next' : 'Next Month'}</span>
              <ChevronRightIcon size="sm" />
            </Button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-(--border) overflow-hidden">
              <div className="flex gap-3.5 p-4">
                <Skeleton className="w-20 shrink-0 aspect-[0.7727] rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <ErrorState
          size="page"
          title="Failed to load papers"
          description={error instanceof Error ? error.message : 'An error occurred'}
          onRetry={() => refetch()}
          retrying={isRefetching}
        />
      )}

      {/* Results */}
      {!isLoading && !isError && data && (
        <>
          <div className="flex items-center justify-between mb-6">
            <p className="text-code text-(--muted-foreground)">
              <span className="font-semibold text-(--foreground)">{data.total_count}</span> paper{data.total_count !== 1 ? 's' : ''}
            </p>
            <button onClick={() => refetch()} className="flex items-center gap-1 text-caption text-(--muted-foreground) hover:text-(--foreground) transition-colors">
              <RefreshIcon size="sm" />Refresh
            </button>
          </div>

          {data.papers.length > 0 ? (
            <div className="space-y-3">
              {data.papers.map((paper, i) => <HFPaperCard key={paper.paper.id} paper={paper} index={i} />)}
            </div>
          ) : (
            <EmptyState
              size="page"
              icon={CalendarIcon}
              title={`No papers for this ${viewMode === 'daily' ? 'date' : 'month'}`}
              description={`Try selecting a different ${viewMode === 'daily' ? 'date' : 'month'}.`}
            />
          )}
        </>
      )}
    </div>
  );
}
