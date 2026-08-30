import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ComponentType } from 'react';
import {
  type IconProps,
  FileTextIcon,
  BookOpenIcon,
  ClockIcon,
  TrendingUpIcon,
  TagIcon,
  ChevronRightIcon,
  PlusIcon,
} from '@/components/icons';
import { ActivityIllustration } from '@/components/illustrations';
import { statisticsApi } from '@/lib/api/statistics';
import { papersApi } from '@/lib/api/papers';
import { tagsApi } from '@/lib/api/tags';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/layout/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { PaperCoverPlaceholder } from '@/components/ui/PaperCoverPlaceholder';
import { usePaperThumbnail } from '@/hooks/use-paper-thumbnail';
import { paperAuthors, paperYear } from '@/lib/paper-display';
import { getPaperTheme } from '@/lib/paper-themes';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';

/* ===== Shared Recharts styling (tokens only) ===== */
const TICK_STYLE = { fontSize: 12, fill: 'var(--muted-foreground)' } as const;
const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--popover)',
  border: '0.0625rem solid var(--border)',
  borderRadius: '0.5rem', // rounded-lg
  fontSize: 'var(--text-caption)',
  lineHeight: 'var(--text-caption--line-height)',
  color: 'var(--popover-foreground)',
};
const TOOLTIP_LABEL_STYLE: React.CSSProperties = { color: 'var(--foreground)', fontWeight: 500 };
const TOOLTIP_ITEM_STYLE: React.CSSProperties = { color: 'var(--muted-foreground)' };

/* ===== The one dashboard card shell — every chart/stat block uses it ===== */
function DashCard({
  title,
  caption,
  trailing,
  flush = false,
  children,
  className,
}: {
  title: string;
  /** Optional one-line explainer under the title. */
  caption?: string;
  trailing?: React.ReactNode;
  /** Edge-to-edge body (row lists); default body is padded. */
  flush?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border border-(--border) bg-(--card)',
        // Clip row hover backgrounds to the rounded corners; never clip charts
        // (tooltips render inside the chart wrapper and must not be cut off).
        flush && 'overflow-hidden',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-subheading text-(--foreground)">{title}</h2>
          {caption && <p className="text-caption text-(--muted-foreground) mt-0.5">{caption}</p>}
        </div>
        {trailing && <div className="shrink-0 pt-0.5">{trailing}</div>}
      </header>
      <div className={cn('flex-1 min-w-0', flush ? 'pb-2' : 'px-5 pb-5')}>{children}</div>
    </section>
  );
}

/* ===== Skeleton variants mirroring the shell ===== */
function DashCardSkeleton({ body = 'list' }: { body?: 'chart' | 'list' | 'block' }) {
  return (
    <div className="flex flex-col rounded-2xl border border-(--border) bg-(--card)">
      <div className="px-5 pt-4 pb-3 space-y-1.5">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="flex-1 px-5 pb-5">
        {body === 'chart' && <Skeleton className="h-60 w-full" />}
        {body === 'block' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Skeleton className="h-12 w-24" />
            <Skeleton className="h-3.5 w-44" />
          </div>
        )}
        {body === 'list' && (
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3.5 py-2.5">
                <Skeleton className="h-12 w-9 shrink-0" />
                <SkeletonText lines={2} lastLineWidth="w-1/2" className="flex-1" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatTileSkeleton() {
  return (
    <div className="flex h-full flex-col justify-between gap-4 rounded-2xl border border-(--border) bg-(--card) p-4 md:p-5">
      <Skeleton className="h-3.5 w-20" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

/* ===== Stat tile: number + caption label + small icon ===== */
function StatTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<IconProps>;
}) {
  return (
    <div className="flex h-full flex-col justify-between gap-4 rounded-2xl border border-(--border) bg-(--card) p-4 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption text-(--muted-foreground) truncate">{label}</p>
        <Icon size="sm" className="shrink-0 text-(--muted-foreground)" />
      </div>
      <div className="min-w-0">
        <p className="text-stat text-(--foreground) leading-none truncate">{value}</p>
        <p className="text-caption text-(--muted-foreground) mt-1.5 truncate">{hint}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErrorObj,
    refetch: refetchStats,
    isRefetching: statsRefetching,
  } = useQuery({
    queryKey: ['statistics', 'dashboard'],
    queryFn: () => statisticsApi.getDashboard(),
  });

  const { data: streaks, isLoading: streaksLoading } = useQuery({
    queryKey: ['statistics', 'streaks'],
    queryFn: () => statisticsApi.getReadingStreaks(),
  });

  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ['papers', 'recent', 6],
    queryFn: () => papersApi.list(1, 6, undefined, { sort_by: 'date_added', sort_order: 'desc' }),
  });

  // Server-side "recently opened" — survives device/browser changes.
  const { data: recentlyOpenedData, isLoading: recentlyOpenedLoading } = useQuery({
    queryKey: ['papers', 'recently-opened', 6],
    queryFn: () => papersApi.getRecent(6),
  });

  const { data: tagsData, isLoading: tagsLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsApi.list(1, 20),
  });

  const recentlyAdded = recentData?.papers ?? [];
  const recentlyOpened = recentlyOpenedData?.papers ?? [];
  // Prefer "recently opened" once the user has actually opened papers.
  const recentPapers = recentlyOpened.length > 0 ? recentlyOpened : recentlyAdded;
  const recentTitle = recentlyOpened.length > 0 ? 'Recently Opened' : 'Recently Added';
  const tags = tagsData?.tags ?? [];
  const currentStreak = streaks?.current_streak ?? 0;
  const longestStreak = streaks?.longest_streak ?? 0;

  // Calculate stats from status_distribution
  const statusDist = stats?.status_distribution ?? {};
  const totalPapers = Object.values(statusDist).reduce((a, b) => a + b, 0);
  const readPapers = statusDist['read'] || 0;
  const totalMins = stats?.total_reading_time_minutes ?? 0;
  const readingTimeLabel = totalMins >= 60 ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m` : `${totalMins}m`;
  const papersReadThisWeek = stats?.papers_read_this_week ?? 0;

  // Prepare activity chart data
  const activityData = [
    { name: 'This Week', count: stats?.papers_read_this_week || 0 },
    { name: 'This Month', count: stats?.papers_read_this_month || 0 },
    { name: 'This Year', count: stats?.papers_read_this_year || 0 },
  ];

  // Prepare reading status distribution data
  const statusChartData = Object.entries(statusDist).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' '),
    value,
    color:
      name === 'read'
        ? 'var(--chart-2)'
        : name === 'archived'
          ? 'var(--chart-4)'
          : name === 'in_progress'
            ? 'var(--chart-1)'
            : 'var(--chart-4)'
  }));

  const pageHeader = (
    <div>
      <h1 className="tracking-tight mb-0.5">Dashboard</h1>
      <p className="text-body text-(--muted-foreground)">Your research velocity at a glance</p>
    </div>
  );

  /* ---- Full-grid loading skeleton ---- */
  if (statsLoading || streaksLoading) {
    return (
      <PageContainer width="wide" className="space-y-6">
        {pageHeader}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <DashCardSkeleton body="chart" />
          <DashCardSkeleton body="chart" />
        </div>
        <DashCardSkeleton body="block" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <DashCardSkeleton body="list" />
          <DashCardSkeleton body="list" />
        </div>
      </PageContainer>
    );
  }

  /* ---- Stats failed: the page has nothing meaningful to chart ---- */
  if (statsError) {
    return (
      <PageContainer width="wide" className="space-y-6">
        {pageHeader}
        <ErrorState
          title="Couldn't load your dashboard"
          description={statsErrorObj instanceof Error ? statsErrorObj.message : undefined}
          onRetry={() => refetchStats()}
          retrying={statsRefetching}
        />
      </PageContainer>
    );
  }

  /* ---- Nothing to chart yet ---- */
  const hasAnyStats =
    totalPapers > 0 ||
    totalMins > 0 ||
    currentStreak > 0 ||
    longestStreak > 0 ||
    activityData.some((d) => d.count > 0);

  if (!hasAnyStats) {
    return (
      <PageContainer width="wide" className="space-y-6">
        {pageHeader}
        <EmptyState
          size="page"
          illustration={ActivityIllustration}
          title="Nothing to chart yet"
          description="Add papers to your library and your reading activity, streaks, and stats will show up here."
          actions={
            <Link to="/ingest">
              <Button variant="primary" icon={<PlusIcon size="sm" />}>Add papers</Button>
            </Link>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide" className="space-y-6">
      {pageHeader}

      {/* ===== Stat tiles ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatTile label="Total papers" value={totalPapers.toString()} hint="In your library" icon={FileTextIcon} />
        <StatTile label="Papers read" value={readPapers.toString()} hint={`${papersReadThisWeek} this week`} icon={BookOpenIcon} />
        <StatTile label="Reading time" value={readingTimeLabel} hint="Total tracked" icon={ClockIcon} />
        <StatTile label="Current streak" value={currentStreak.toString()} hint={`Best: ${longestStreak} days`} icon={TrendingUpIcon} />
      </div>

      {/* ===== Charts ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <DashCard title="Reading Progress" caption="Papers read this week, month, and year">
          <div className="min-h-60 w-full">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={activityData} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} tick={TICK_STYLE} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={TICK_STYLE} />
                <Tooltip
                  cursor={{ fill: 'var(--muted)', fillOpacity: 0.5 }}
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  formatter={(value) => [value ?? 0, 'Papers read']}
                />
                <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="sr-only">
            Papers read — this week: {activityData[0].count}, this month: {activityData[1].count}, this year: {activityData[2].count}.
          </p>
        </DashCard>

        <DashCard title="Paper Status" caption="Library breakdown by reading status">
          <div className="relative min-h-60 w-full">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Donut center: the whole the parts sum to */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-stat text-(--foreground) leading-none">{totalPapers}</span>
              <span className="text-caption text-(--muted-foreground) mt-1">papers</span>
            </div>
          </div>
          {/* Legend — multiple categories, so identity is never tooltip-only */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            {statusChartData.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-caption text-(--muted-foreground)">
                  {item.name}: {item.value}
                </span>
              </div>
            ))}
          </div>
        </DashCard>
      </div>

      {/* ===== Reading streak ===== */}
      <DashCard title="Reading Streak" caption="Consecutive days with reading activity">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="text-display text-(--foreground) leading-none">{currentStreak}</div>
          <div className="text-body text-(--muted-foreground) uppercase tracking-[0.2em] font-medium mt-3">
            Day Reading Streak
          </div>
          {longestStreak > currentStreak && (
            <p className="text-caption text-(--muted-foreground) mt-3">
              Personal best: {longestStreak} days
            </p>
          )}
        </div>
      </DashCard>

      {/* ===== Recent papers + Tags ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {recentLoading || recentlyOpenedLoading ? (
          <DashCardSkeleton body="list" />
        ) : (
          <DashCard
            title={recentTitle}
            flush
            trailing={
              <Link to="/papers" className="text-caption text-(--muted-foreground) hover:text-(--foreground)">
                View all →
              </Link>
            }
          >
            {recentPapers.length === 0 ? (
              <EmptyState size="row" title="No papers yet" />
            ) : (
              <div className="divide-y divide-(--border)">
                {recentPapers.map((paper) => (
                  <PaperRow key={paper.id} paper={paper} />
                ))}
              </div>
            )}
          </DashCard>
        )}

        {tagsLoading ? (
          <DashCardSkeleton body="list" />
        ) : (
          <DashCard
            title="Tags"
            trailing={
              <Link to="/papers" className="text-caption text-(--muted-foreground) hover:text-(--foreground)">
                Manage →
              </Link>
            }
          >
            {tags.length === 0 ? (
              <EmptyState size="row" title="No tags yet" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="text-caption font-medium"
                  >
                    <TagIcon size="xs" className="mr-1" />
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}
          </DashCard>
        )}
      </div>
    </PageContainer>
  );
}

function PaperRow({ paper }: { paper: import('@/lib/api/papers').Paper }) {
  const theme = getPaperTheme(paper.id);
  const coverUrl = usePaperThumbnail(paper);
  const authorText = paperAuthors(paper);
  const publicationYear = paperYear(paper);

  return (
    <Link
      to={`/papers/${paper.id}`}
      className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-(--muted)/40"
    >
      {/* Thumbnail */}
      <div
        className="w-10 shrink-0 aspect-[0.7727] rounded-lg overflow-hidden border shadow-xs"
        style={{ borderColor: theme.border, backgroundColor: theme.bg }}
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          <PaperCoverPlaceholder theme={theme.name} />
        )}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <p className="text-code font-medium text-(--foreground) truncate">{paper.title}</p>
        {authorText && (
          <p className="text-caption text-(--muted-foreground) truncate">{authorText}</p>
        )}
      </div>

      {publicationYear && (
        <span className="text-caption text-(--muted-foreground) shrink-0">{publicationYear}</span>
      )}

      <ChevronRightIcon size="sm" className="shrink-0 text-(--muted-foreground) opacity-40" />
    </Link>
  );
}
