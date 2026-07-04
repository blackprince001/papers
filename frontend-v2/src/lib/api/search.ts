import { api } from './client';

export type SearchMode = 'fulltext' | 'semantic';

export interface SearchRequest {
  query: string;
  mode?: SearchMode;
  limit?: number;
  threshold?: number;
  year_from?: number;
  year_to?: number;
  reading_status?: 'not_started' | 'in_progress' | 'read' | 'archived';
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface SearchResultItem {
  paper_id: number;
  title: string;
  authors?: string;
  snippet?: string;
  similarity_score?: number;
}

export interface SearchResponse {
  results: SearchResultItem[];
  query: string;
  total: number;
  /** False when the server has no embedding key — semantic mode is degraded. */
  semantic_available: boolean;
}

export interface SearchCapabilities {
  semantic_available: boolean;
  reason?: string | null;
}

export const searchApi = {
  search: async (request: SearchRequest): Promise<SearchResponse> => {
    const { mode = 'fulltext', ...rest } = request;
    const endpoint = mode === 'semantic' ? '/search' : '/search/fulltext';
    
    const response = await api.post<{ results: Array<{ paper: any; similarity: number }>; query: string; total: number; semantic_available?: boolean }>(
      endpoint,
      { ...rest, limit: rest.limit || 20 }
    );
    
    // Transform backend response to match frontend expectations
    return {
      results: response.results.map(r => ({
        paper_id: r.paper.id,
        title: r.paper.title,
        authors: r.paper.authors,
        snippet: r.paper.content_text?.substring(0, 200),
        similarity_score: r.similarity,
      })),
      query: response.query,
      total: response.total,
      semantic_available: response.semantic_available !== false,
    };
  },

  getCapabilities: (): Promise<SearchCapabilities> =>
    api.get<SearchCapabilities>('/search/capabilities'),
};
