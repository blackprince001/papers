import { useState, useCallback, useRef } from 'react';
import type {
  DiscoveredPaperPreview,
  QueryUnderstanding,
  SearchOverview,
  ClusteringResult,
  PaperRelevanceExplanation,
} from '@/lib/api/discovery';

export interface SearchStatus {
  stage: string;
  message: string;
  progress: number;
  source?: string;
}

export interface SourceResult {
  source: string;
  papers: DiscoveredPaperPreview[];
  total_available?: number;
  error?: string;
}

export interface AISearchStreamState {
  isSearching: boolean;
  status: SearchStatus | null;
  sourceResults: Record<string, SourceResult>;
  allPapers: DiscoveredPaperPreview[];
  queryUnderstanding: QueryUnderstanding | null;
  overview: SearchOverview | null;
  clustering: ClusteringResult | null;
  relevanceExplanations: PaperRelevanceExplanation[];
  error: string | null;
  isComplete: boolean;
}

const initialState: AISearchStreamState = {
  isSearching: false,
  status: null,
  sourceResults: {},
  allPapers: [],
  queryUnderstanding: null,
  overview: null,
  clustering: null,
  relevanceExplanations: [],
  error: null,
  isComplete: false,
};

interface AISearchRequest {
  query: string;
  sources?: string[];
  filters?: {
    year_from?: number;
    year_to?: number;
    authors?: string[];
    min_citations?: number;
  };
  limit?: number;
  include_overview?: boolean;
  include_clustering?: boolean;
  include_relevance?: boolean;
}

export function useAISearchStream() {
  const [state, setState] = useState<AISearchStreamState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = useCallback(async (request: AISearchRequest) => {
    // Cancel any existing search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Reset state
    setState({
      ...initialState,
      isSearching: true,
    });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      const response = await fetch(`${API_BASE_URL}/discovery/ai-search/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: request.query,
          sources: request.sources || ['arxiv', 'semantic_scholar'],
          filters: request.filters,
          limit: request.limit || 20,
          include_overview: request.include_overview ?? true,
          include_clustering: request.include_clustering ?? true,
          include_relevance: request.include_relevance ?? true,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Search failed' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          } else if (line === '' && eventType && eventData) {
            // End of event, process it
            try {
              const data = JSON.parse(eventData);
              handleEvent(eventType, data, setState);
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
            }
            eventType = '';
            eventData = '';
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // Search was cancelled, ignore
        return;
      }

      setState((prev) => ({
        ...prev,
        isSearching: false,
        error: (error as Error).message || 'Search failed',
      }));
    }
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      isSearching: false,
    }));
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState(initialState);
  }, [cancel]);

  return {
    ...state,
    search,
    cancel,
    reset,
  };
}

function handleEvent(
  eventType: string,
  data: Record<string, unknown>,
  setState: React.Dispatch<React.SetStateAction<AISearchStreamState>>
) {
  switch (eventType) {
    case 'status':
      setState((prev) => ({
        ...prev,
        status: {
          stage: data.stage as string,
          message: data.message as string,
          progress: data.progress as number,
          source: data.source as string | undefined,
        },
      }));
      break;

    case 'source_results':
      setState((prev) => {
        const sourceResult: SourceResult = {
          source: data.source as string,
          papers: data.papers as DiscoveredPaperPreview[],
          total_available: data.total_available as number | undefined,
          error: data.error as string | undefined,
        };

        const newSourceResults = {
          ...prev.sourceResults,
          [sourceResult.source]: sourceResult,
        };

        // Aggregate all papers
        const allPapers = Object.values(newSourceResults).flatMap((r) => r.papers);

        return {
          ...prev,
          sourceResults: newSourceResults,
          allPapers,
        };
      });
      break;

    case 'query_understanding':
      setState((prev) => ({
        ...prev,
        queryUnderstanding: {
          interpreted_query: data.interpreted_query as string,
          key_concepts: data.key_concepts as string[],
          search_terms: data.search_terms as string[],
          domain_hints: data.domain_hints as string[],
          query_type: data.query_type as 'exploratory' | 'specific' | 'comparative' | 'methodological',
        },
      }));
      break;

    case 'overview':
      setState((prev) => ({
        ...prev,
        overview: {
          overview: data.overview as string,
          key_themes: data.key_themes as string[],
          notable_trends: data.notable_trends as string[],
          research_gaps: data.research_gaps as string[],
          suggested_followups: data.suggested_followups as string[],
        },
      }));
      break;

    case 'clustering':
      setState((prev) => ({
        ...prev,
        clustering: {
          clusters: data.clusters as ClusteringResult['clusters'],
          unclustered_indices: data.unclustered_indices as number[],
        },
      }));
      break;

    case 'relevance':
      setState((prev) => ({
        ...prev,
        relevanceExplanations: data.explanations as PaperRelevanceExplanation[],
      }));
      break;

    case 'complete':
      setState((prev) => ({
        ...prev,
        isSearching: false,
        isComplete: true,
        status: {
          stage: 'complete',
          message: 'Search complete',
          progress: 100,
        },
      }));
      break;

    case 'error':
      setState((prev) => ({
        ...prev,
        isSearching: false,
        error: data.message as string,
      }));
      break;
  }
}

export default useAISearchStream;
