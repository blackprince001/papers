import { api } from './client';

export interface ReadingStatistics {
  papers_read_this_week: number;
  papers_read_this_month: number;
  papers_read_this_year: number;
  total_reading_time_minutes: number;
  average_reading_time_per_paper: number;
  reading_streak_days: number;
  status_distribution: Record<string, number>;
  priority_distribution: Record<string, number>;
}

export interface ReadingStreak {
  current_streak: number;
  longest_streak: number;
  streak_start_date?: string;
  last_reading_date?: string;
}

export const statisticsApi = {
  getDashboard: async (): Promise<ReadingStatistics> => {
    return api.get<ReadingStatistics>('/statistics/dashboard');
  },

  getReadingStreaks: async (): Promise<ReadingStreak> => {
    return api.get<ReadingStreak>('/statistics/reading-streaks');
  },
};
