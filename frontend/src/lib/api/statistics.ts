import apiClient from './client';

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
    const response = await apiClient.get<ReadingStatistics>('/statistics/dashboard');
    return response.data;
  },

  getReadingStreaks: async (): Promise<ReadingStreak> => {
    const response = await apiClient.get<ReadingStreak>('/statistics/reading-streaks');
    return response.data;
  },
};

