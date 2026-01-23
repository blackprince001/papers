import { api } from './client';

// Types

export interface DiscoverySearchFilters {
  year_from?: number;
  year_to?: number;
  authors?: string[];
  min_citations?: number;
}

export interface DiscoverySearchRequest {
  query: string;
  sources?: string[];
  filters?: DiscoverySearchFilters;
  limit?: number;
  include_embeddings?: boolean;
}

export interface DiscoveredPaperPreview {
  source: string;
  external_id: string;
  title: string;
  authors: string[];
  abstract?: string;
  year?: number;
  doi?: string;
  url?: string;
  pdf_url?: string;
  citation_count?: number;
  relevance_score?: number;
}

export interface SourceSearchResult {
  source: string;
  papers: DiscoveredPaperPreview[];
  total_available?: number;
  error?: string;
}

export interface DiscoverySearchResponse {
  query: string;
  sources_searched: string[];
  results: SourceSearchResult[];
  total_results: number;
  deduplicated_count: number;
}

export interface DiscoverySourceInfo {
  name: string;
  display_name: string;
  description: string;
  supports_search: boolean;
  supports_citations: boolean;
  supports_recommendations: boolean;
  rate_limit?: string;
}

export interface DiscoverySourcesResponse {
  sources: DiscoverySourceInfo[];
}

export interface AddToLibraryResponse {
  paper_id: number;
  title: string;
  message: string;
}

export interface BatchAddToLibraryRequest {
  discovered_paper_ids: number[];
  group_ids?: number[];
  tag_ids?: number[];
}

export interface BatchAddToLibraryResponse {
  added: AddToLibraryResponse[];
  errors: Array<{ discovered_paper_id?: number; title?: string; error: string }>;
}

export interface CitationExplorerRequest {
  source: string;
  external_id: string;
  direction?: 'citations' | 'references' | 'both';
  limit?: number;
}

export interface CitationExplorerResponse {
  paper: DiscoveredPaperPreview;
  citations: DiscoveredPaperPreview[];
  references: DiscoveredPaperPreview[];
  citations_count: number;
  references_count: number;
}

export interface RecommendationRequest {
  based_on?: 'library' | 'paper' | 'group';
  paper_id?: number;
  group_id?: number;
  sources?: string[];
  limit?: number;
}

export interface RecommendationResponse {
  based_on: string;
  recommendations: DiscoveredPaperPreview[];
  total: number;
}

// AI Search Types

export interface QueryUnderstanding {
  interpreted_query: string;
  boolean_query?: string;
  key_concepts: string[];
  search_terms: string[];
  domain_hints: string[];
  query_type: 'exploratory' | 'specific' | 'comparative' | 'methodological';
}

export interface SearchOverview {
  overview: string;
  key_themes: string[];
  notable_trends: string[];
  research_gaps: string[];
  suggested_followups: string[];
}

export interface PaperCluster {
  name: string;
  description: string;
  keywords: string[];
  paper_indices: number[];
}

export interface ClusteringResult {
  clusters: PaperCluster[];
  unclustered_indices: number[];
}

export interface PaperRelevanceExplanation {
  paper_index: number;
  relevance: string;
  key_contribution: string;
  relevance_score: number;
}

export interface RelevanceExplanations {
  explanations: PaperRelevanceExplanation[];
}

export interface AISearchRequest {
  query: string;
  sources?: string[];
  filters?: DiscoverySearchFilters;
  limit?: number;
  include_overview?: boolean;
  include_clustering?: boolean;
  include_relevance?: boolean;
}

export interface AISearchResponse {
  query: string;
  query_understanding?: QueryUnderstanding;
  sources_searched: string[];
  results: SourceSearchResult[];
  total_results: number;
  deduplicated_count: number;
  overview?: SearchOverview;
  clustering?: ClusteringResult;
  relevance_explanations?: RelevanceExplanations;
}

// API functions

export const discoveryApi = {
  /**
   * List all available discovery sources
   */
  getSources: () => api.get<DiscoverySourcesResponse>('/discovery/sources'),

  /**
   * Search for papers across multiple sources
   */
  search: (request: DiscoverySearchRequest) =>
    api.post<DiscoverySearchResponse>('/discovery/search', request),

  /**
   * AI-enhanced search for papers with natural language understanding
   * Provides query understanding, overview, clustering, and relevance explanations
   */
  aiSearch: (request: AISearchRequest) =>
    api.post<AISearchResponse>('/discovery/ai-search', request),

  /**
   * Get details for a specific discovered paper
   */
  getPaperDetails: (source: string, externalId: string) =>
    api.get<DiscoveredPaperPreview>(`/discovery/paper/${source}/${encodeURIComponent(externalId)}`),

  /**
   * Add a discovered paper to the library
   */
  addToLibrary: (discoveredPaperId: number, groupIds?: number[]) => {
    const params: Record<string, string | number | boolean | undefined> = {};
    if (groupIds && groupIds.length > 0)
    {
      // FastAPI expects repeated query params for arrays
      // We'll pass them as comma-separated and handle on backend
      params.group_ids = groupIds.join(',');
    }
    return api.post<AddToLibraryResponse>(
      `/discovery/paper/${discoveredPaperId}/add-to-library`,
      undefined,
      { params }
    );
  },

  /**
   * Add multiple discovered papers to the library
   */
  batchAddToLibrary: (request: BatchAddToLibraryRequest) =>
    api.post<BatchAddToLibraryResponse>('/discovery/batch/add-to-library', request),

  /**
   * Explore citation network for a paper
   */
  exploreCitations: (request: CitationExplorerRequest) =>
    api.post<CitationExplorerResponse>('/discovery/citations', request),

  /**
   * Get paper recommendations
   */
  getRecommendations: (request: RecommendationRequest) =>
    api.post<RecommendationResponse>('/discovery/recommendations', request),

  /**
   * List cached discovered papers
   */
  getCachedPapers: (source?: string, limit: number = 50, offset: number = 0) =>
    api.get<{
      papers: DiscoveredPaperPreview[];
      total: number;
      offset: number;
      limit: number;
    }>('/discovery/cached', {
      params: { source, limit, offset },
    }),
};

export default discoveryApi;
