import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileTextIcon, BookOpenIcon, ClockIcon, TrendingUpIcon, TagIcon, ChevronRightIcon } from '@/components/icons';
import { statisticsApi } from '@/lib/api/statistics';
import { papersApi } from '@/lib/api/papers';
import { tagsApi } from '@/lib/api/tags';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { PaperCoverPlaceholder } from '@/components/ui/PaperCoverPlaceholder';
import { usePaperThumbnail } from '@/hooks/use-paper-thumbnail';
import { paperAuthors, paperYear } from '@/lib/paper-display';
import { getPaperTheme } from '@/lib/paper-themes';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

/* ===== Reusable dashboard card shell ===== */
function DashCard({
  title,
  trailing,
  children,
  className,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-(--background) border border-(--border) rounded-xl overflow-hidden flex flex-col ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5">
        <h2 className="text-body-lg font-medium">{title}</h2>
        {trailing}
      </div>
      {/* Inset content area */}
      <div className="bg-(--card) rounded-t-xl border-t border-(--border) flex-1">
        {children}
      </div>
    </div>
  );
}

/* ===== Skeleton variant of the card ===== */
function DashCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-(--background) border border-(--border) rounded-xl overflow-hidden">
      <div className="px-5 py-3.5">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="bg-(--card) rounded-t-xl border-t border-(--border) divide-y divide-(--border)">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-5 w-6 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
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


  return (
    <div className="max-w-content mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="tracking-tight">Dashboard</h1>
        <p className="text-body text-(--muted-foreground) mt-1">Your research velocity at a glance</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-(--background) border border-(--border) rounded-xl overflow-hidden">
              <div className="px-5 py-3.5">
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="bg-(--card) rounded-t-xl border-t border-(--border) px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Skeleton className="h-8 w-16 mb-2" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-xl" />
                </div>
              </div>
            </div>
          ))
        ) : (
          <>
            <StatCard label="Total Papers" value={totalPapers.toString()} icon={FileTextIcon} change={`${totalPapers} items`} />
            <StatCard label="Read This Week" value={readPapers.toString()} icon={BookOpenIcon} change={`${papersReadThisWeek} this week`} />
            <StatCard label="Reading Time" value={readingTimeLabel} icon={ClockIcon} change="Total minutes" />
            <StatCard label="Current Streak" value={currentStreak.toString()} icon={TrendingUpIcon} change={`Best: ${longestStreak}`} />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <DashCard title="Reading Progress">
          <div className="px-5 pt-5 pb-2">
            <ResponsiveContainer width="100%" height={242}>
              <BarChart data={activityData}>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '0.0625rem solid var(--border)',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem'
                  }}
                  formatter={(value: any) => [value, 'Papers Read']}
                />
                <Bar dataKey="count" fill="var(--foreground)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DashCard>

        <DashCard title="Paper Status">
          <div className="p-5">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={88}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '0.0625rem solid var(--border)',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2">
              {statusChartData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-caption text-(--muted-foreground)">
                    {item.name}: {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </DashCard>
      </div>

      {/* Reading streak */}
      <DashCard title="Reading Streak" className="mb-6">
        {streaksLoading ? (
          <div className="p-8">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="text-display font-bold text-(--foreground) leading-none mb-3">{currentStreak}</div>
              <div className="text-body-lg text-(--muted-foreground) uppercase tracking-[0.2em] font-medium">
                Day Reading Streak
              </div>
              {longestStreak > currentStreak && (
                <p className="text-body text-(--muted-foreground) mt-4">
                  Personal best: {longestStreak} days
                </p>
              )}
            </div>
          </div>
        )}
      </DashCard>

      {/* Recent papers + Tags */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent papers */}
        {recentLoading || recentlyOpenedLoading ? (
          <DashCardSkeleton rows={5} />
        ) : (
          <DashCard
            title={recentTitle}
            trailing={
              <Link to="/papers" className="text-caption text-(--muted-foreground) hover:text-(--foreground)">
                View all →
              </Link>
            }
          >
            {recentPapers.length === 0 ? (
              <div className="text-center py-8 text-(--muted-foreground)">
                <p className="text-code">No papers yet</p>
                <Link to="/ingest" className="text-caption text-(--primary) hover:underline mt-2 inline-block">
                  Add your first paper
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-(--border)">
                {recentPapers.map((paper) => (
                  <PaperRow key={paper.id} paper={paper} />
                ))}
              </div>
            )}
          </DashCard>
        )}

        {/* Tags */}
        {tagsLoading ? (
          <DashCardSkeleton rows={5} />
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
              <div className="text-center py-8 text-(--muted-foreground)">
                <p className="text-code">No tags yet</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 p-5">
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
    </div>
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
        className="w-10 shrink-0 aspect-[0.7727] rounded-md overflow-hidden border shadow-xs"
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

function StatCard({ label, value, icon: Icon, change }: {
  label: string;
  value: string;
  icon: React.ElementType;
  change: string;
}) {
  return (
    <div className="bg-(--background) border border-(--border) rounded-xl overflow-hidden">
      <div className="px-5 py-3.5">
        <p className="text-caption font-medium uppercase tracking-wider text-(--muted-foreground)">
          {label}
        </p>
      </div>
      <div className="bg-(--card) rounded-t-xl border-t border-(--border) px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-stat text-(--foreground) leading-none mb-2">{value}</p>
            <p className="text-caption text-(--muted-foreground)">{change}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-(--muted) flex items-center justify-center">
            <Icon size="lg" className="text-(--muted-foreground)" />
          </div>
        </div>
      </div>
    </div>
  );
}
