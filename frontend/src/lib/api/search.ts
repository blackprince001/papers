import { api } from './client';
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
    return api.post<SearchResponse>('/search', request);
  },

  fulltextSearch: async (request: SearchRequest): Promise<SearchResponse> => {
    return api.post<SearchResponse>('/search/fulltext', request);
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
    return api.post('/search/annotations', null, {
      params: { query, limit },
    });
  },

  listSavedSearches: async (): Promise<SavedSearch[]> => {
    return api.get<SavedSearch[]>('/saved-searches');
  },

  createSavedSearch: async (search: { name: string; description?: string; query_params: SearchRequest }): Promise<SavedSearch> => {
    return api.post<SavedSearch>('/saved-searches', search);
  },

  deleteSavedSearch: async (id: number): Promise<void> => {
    await api.delete(`/saved-searches/${id}`);
  },
};
