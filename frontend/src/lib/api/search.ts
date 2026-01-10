import apiClient from './client';
import type { Paper } from './papers';

export interface SearchRequest {
  query: string;
  limit?: number;
  threshold?: number;
  // Advanced filters
  date_from?: string;
  date_to?: string;
  authors?: string[];
  journal?: string;
  tag_ids?: number[];
  reading_status?: 'not_started' | 'in_progress' | 'read' | 'archived';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  group_ids?: number[];
  has_annotations?: boolean;
  has_notes?: boolean;
  reading_time_min?: number;
  reading_time_max?: number;
}

export interface SearchResult {
  paper: Paper;
  similarity: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  total: number;
}

export interface SavedSearch {
  id: number;
  name: string;
  description?: string;
  query_params: SearchRequest;
  created_at: string;
  updated_at: string;
}

export const searchApi = {
  search: async (request: SearchRequest): Promise<SearchResponse> => {
    const response = await apiClient.post<SearchResponse>('/search', request);
    return response.data;
  },

  fulltextSearch: async (request: SearchRequest): Promise<SearchResponse> => {
    const response = await apiClient.post<SearchResponse>('/search/fulltext', request);
    return response.data;
  },

  searchAnnotations: async (query: string, limit: number = 10): Promise<{
    annotations: Array<{
      id: number;
      paper_id: number;
      content: string;
      highlighted_text?: string;
    }>;
    total: number;
  }> => {
    const response = await apiClient.post('/search/annotations', null, {
      params: { query, limit },
    });
    return response.data;
  },

  listSavedSearches: async (): Promise<SavedSearch[]> => {
    const response = await apiClient.get<SavedSearch[]>('/saved-searches');
    return response.data;
  },

  createSavedSearch: async (search: { name: string; description?: string; query_params: SearchRequest }): Promise<SavedSearch> => {
    const response = await apiClient.post<SavedSearch>('/saved-searches', search);
    return response.data;
  },

  deleteSavedSearch: async (id: number): Promise<void> => {
    await apiClient.delete(`/saved-searches/${id}`);
  },
};

