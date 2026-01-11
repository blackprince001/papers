import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { statisticsApi } from '@/lib/api/statistics';
import { BookOpen, Clock, TrendingUp, Calendar, Flame } from 'lucide-react';
import { PieChart } from '@/components/charts/PieChart';
import { BarChart } from '@/components/charts/BarChart';
import { StatCardSkeleton, ChartCardSkeleton } from '@/components/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['statistics', 'dashboard'],
    queryFn: () => statisticsApi.getDashboard(),
  });

  const { data: streaks } = useQuery({
    queryKey: ['statistics', 'streaks'],
    queryFn: () => statisticsApi.getReadingStreaks(),
  });

  if (isLoading)
  {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-5 w-80" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ChartCardSkeleton />
          <ChartCardSkeleton />
        </div>
        <ChartCardSkeleton />
        <div className="bg-grayscale-8 border border-blue-21 rounded-md p-6">
          <Skeleton className="h-6 w-40 mb-4" />
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-4 w-28" />
            </div>
            <div>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-4 w-36" />
            </div>
            <div>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!stats)
  {
    return (
      <div className="p-6">
        <div className="text-center">No statistics available</div>
      </div>
    );
  }

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0)
    {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Transform status distribution for pie chart
  const statusChartData = Object.entries(stats.status_distribution).map(([status, count]) => ({
    name: status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value: count,
  }));

  // Transform priority distribution for pie chart
  const priorityChartData = Object.entries(stats.priority_distribution).map(([priority, count]) => ({
    name: priority.charAt(0).toUpperCase() + priority.slice(1),
    value: count,
  }));

  // Transform papers read data for bar chart
  const papersReadChartData = [
    { name: 'This Week', value: stats.papers_read_this_week },
    { name: 'This Month', value: stats.papers_read_this_month },
    { name: 'This Year', value: stats.papers_read_this_year },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-medium mb-2 text-balance">Reading Dashboard</h1>
        <p className="text-blue-31 text-pretty">Track your research reading progress</p>
      </div>

      {/* Stats Grid with staggered entrance */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.1 } }
        }}
      >
        <div className="bg-grayscale-8 border border-blue-21 rounded-md p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-31">This Week</h3>
            <Calendar className="h-5 w-5 text-blue-31" />
          </div>
          <p className="text-3xl font-medium">{stats.papers_read_this_week}</p>
          <p className="text-sm text-blue-31 mt-1">papers read</p>
        </div>

        <div className="bg-grayscale-8 border border-blue-21 rounded-md p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-31">This Month</h3>
            <BookOpen className="h-5 w-5 text-blue-31" />
          </div>
          <p className="text-3xl font-medium">{stats.papers_read_this_month}</p>
          <p className="text-sm text-blue-31 mt-1">papers read</p>
        </div>

        <div className="bg-grayscale-8 border border-blue-21 rounded-md p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-31">Total Time</h3>
            <Clock className="h-5 w-5 text-blue-31" />
          </div>
          <p className="text-3xl font-medium">{formatTime(stats.total_reading_time_minutes)}</p>
          <p className="text-sm text-blue-31 mt-1">reading time</p>
        </div>

        <div className="bg-grayscale-8 border border-blue-21 rounded-md p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-31">Streak</h3>
            <Flame className="h-5 w-5 text-blue-31" />
          </div>
          <p className="text-3xl font-medium">{streaks?.current_streak || 0}</p>
          <p className="text-sm text-blue-31 mt-1">days in a row</p>
        </div>
      </motion.div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-grayscale-8 border border-blue-21 rounded-md p-6">
          <PieChart
            data={statusChartData}
            title="Reading Status Distribution"
          />
        </div>

        <div className="bg-grayscale-8 border border-blue-21 rounded-md p-6">
          <PieChart
            data={priorityChartData}
            title="Priority Distribution"
          />
        </div>
      </div>

      {/* Papers Read Comparison Chart */}
      <div className="bg-grayscale-8 border border-blue-21 rounded-md p-6">
        <BarChart
          data={papersReadChartData}
          title="Papers Read Comparison"
          xAxisLabel="Time Period"
          yAxisLabel="Number of Papers"
        />
      </div>

      {/* Yearly Stats */}
      <div className="bg-grayscale-8 border border-blue-21 rounded-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Yearly Overview</h3>
          <TrendingUp className="h-5 w-5 text-blue-31" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-medium">{stats.papers_read_this_year}</p>
            <p className="text-sm text-blue-31">Papers this year</p>
          </div>
          <div>
            <p className="text-2xl font-medium">{stats.average_reading_time_per_paper.toFixed(1)}</p>
            <p className="text-sm text-blue-31">Avg minutes per paper</p>
          </div>
          <div>
            <p className="text-2xl font-medium">{streaks?.longest_streak || 0}</p>
            <p className="text-sm text-blue-31">Longest streak (days)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
