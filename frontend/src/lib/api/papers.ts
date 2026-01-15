import apiClient from './client';

export interface Tag {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Paper {
  id: number;
  title: string;
  doi?: string;
  url?: string;
  file_path?: string;
  content_text?: string;
  metadata_json?: Record<string, any>;
  volume?: string;
  issue?: string;
  pages?: string;
  isbn?: string;
  issn?: string;
  viewed_count?: number;
  reading_status?: 'not_started' | 'in_progress' | 'read' | 'archived';
  reading_time_minutes?: number;
  last_read_page?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  status_updated_at?: string;
  last_read_at?: string;
  tags?: Tag[];
  created_at: string;
  updated_at: string;
  background_processing_message?: string;
}

export interface PaperCreate {
  title: string;
  url: string;
  doi?: string;
  metadata_json?: Record<string, any>;
  group_ids?: number[];
}

export interface PaperListResponse {
  papers: Paper[];
  total: number;
  page: number;
  page_size: number;
}

export interface PaperReference {
  format: string;
  reference: string;
}

export interface PaperUploadResponse {
  paper_ids: number[];
  errors: Array<{ filename: string; error: string }>;
  message?: string;
}

export interface BatchIngestionResponse {
  paper_ids: number[];
  errors: Array<{ url: string; error: string }>;
  message: string;
}

export interface RelatedPaperExternal {
  title?: string;
  doi?: string;
  authors: string[];
  url?: string;
  year?: number;
}

export interface RelatedPapersResponse {
  cited_by: RelatedPaperExternal[];
  cited_here: RelatedPaperExternal[];
  related_library: Paper[];
  related_internet: RelatedPaperExternal[];
}

export interface CitationGraphNode {
  id: number | string;
  title: string;
  type: 'paper' | 'external';
}

export interface CitationGraphEdge {
  source: number | string;
  target: number | string;
  type: 'cites';
}

export interface CitationGraph {
  nodes: CitationGraphNode[];
  edges: CitationGraphEdge[];
}

export interface Citation {
  id: number;
  paper_id: number;
  cited_paper_id: number | null;
  citation_context: string | null;
  external_paper_title: string | null;
  external_paper_doi: string | null;
  created_at: string | null;
  cited_paper?: Paper;
}

export interface PaperListFilters {
  sort_by?: 'date_added' | 'viewed' | 'title' | 'authors';
  sort_order?: 'asc' | 'desc';
  group_id?: number;
  tag_id?: number;
  has_file?: boolean;
  date_from?: string;
  date_to?: string;
}

export const papersApi = {
  list: async (
    page = 1,
    pageSize = 20,
    search?: string,
    filters?: PaperListFilters
  ): Promise<PaperListResponse> => {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
    });
    if (search)
    {
      params.append('search', search);
    }
    if (filters)
    {
      if (filters.sort_by) params.append('sort_by', filters.sort_by);
      if (filters.sort_order) params.append('sort_order', filters.sort_order);
      if (filters.group_id !== undefined) params.append('group_id', filters.group_id.toString());
      if (filters.has_file !== undefined) params.append('has_file', filters.has_file.toString());
      if (filters.tag_id !== undefined) params.append('tag_id', filters.tag_id.toString());
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
    }
    const response = await apiClient.get<PaperListResponse>(`/papers?${params}`);
    return response.data;
  },

  get: async (id: number): Promise<Paper> => {
    const response = await apiClient.get<Paper>(`/papers/${id}`);
    return response.data;
  },

  create: async (paper: PaperCreate): Promise<Paper> => {
    const response = await apiClient.post<Paper>('/ingest', paper);
    return response.data;
  },

  update: async (id: number, updates: Partial<PaperCreate> & { tag_ids?: number[] }): Promise<Paper> => {
    const response = await apiClient.patch<Paper>(`/papers/${id}`, updates);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/papers/${id}`);
  },

  deleteBulk: async (ids: number[]): Promise<void> => {
    if (ids.length === 0) return;
    const params = new URLSearchParams();
    ids.forEach(id => params.append('paper_ids', id.toString()));
    await apiClient.delete(`/papers?${params.toString()}`);
  },

  getReference: async (id: number, format: 'apa' | 'mla' | 'bibtex' = 'apa'): Promise<PaperReference> => {
    const response = await apiClient.get<PaperReference>(`/papers/${id}/reference?format=${format}`);
    return response.data;
  },

  uploadFiles: async (files: File[], groupIds?: number[]): Promise<PaperUploadResponse> => {
    const formData = new FormData();

    files.forEach((file) => {
      formData.append('files', file);
    });

    if (groupIds && groupIds.length > 0)
    {
      formData.append('group_ids', JSON.stringify(groupIds));
    }

    const response = await apiClient.post<PaperUploadResponse>('/ingest/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  getRelated: async (id: number): Promise<RelatedPapersResponse> => {
    const response = await apiClient.get<RelatedPapersResponse>(`/papers/${id}/related`);
    return response.data;
  },

  regenerateMetadata: async (id: number): Promise<Paper> => {
    const response = await apiClient.post<Paper>(`/papers/${id}/regenerate-metadata`);
    return response.data;
  },

  regenerateMetadataBulk: async (paperIds: number[]): Promise<{ successful: number[]; failed: Array<{ paper_id: number; error: string }> }> => {
    const response = await apiClient.post<{ successful: number[]; failed: Array<{ paper_id: number; error: string }> }>(
      '/papers/regenerate-metadata-bulk',
      { paper_ids: paperIds }
    );
    return response.data;
  },

  extractCitations: async (id: number): Promise<{ paper_id: number; citations_extracted: number }> => {
    const response = await apiClient.post<{ paper_id: number; citations_extracted: number }>(`/papers/${id}/extract-citations`);
    return response.data;
  },

  updateReadingStatus: async (id: number, reading_status: 'not_started' | 'in_progress' | 'read' | 'archived'): Promise<Paper> => {
    const response = await apiClient.patch<Paper>(`/papers/${id}/reading-status`, { reading_status });
    return response.data;
  },

  updatePriority: async (id: number, priority: 'low' | 'medium' | 'high' | 'critical'): Promise<Paper> => {
    const response = await apiClient.patch<Paper>(`/papers/${id}/priority`, { priority });
    return response.data;
  },

  getReadingProgress: async (id: number): Promise<{
    paper_id: number;
    reading_status: string;
    reading_time_minutes: number;
    last_read_page?: number;
    priority: string;
    status_updated_at?: string;
    last_read_at?: string;
  }> => {
    const response = await apiClient.get(`/papers/${id}/reading-progress`);
    return response.data;
  },

  startReadingSession: async (id: number): Promise<{
    id: number;
    paper_id: number;
    start_time: string;
    end_time?: string;
    duration_minutes: number;
    pages_viewed: number;
  }> => {
    const response = await apiClient.post(`/papers/${id}/reading-session/start`);
    return response.data;
  },

  endReadingSession: async (id: number, updates?: {
    end_time?: string;
    duration_minutes?: number;
    pages_viewed?: number;
    last_read_page?: number;
  }): Promise<{
    id: number;
    paper_id: number;
    start_time: string;
    end_time?: string;
    duration_minutes: number;
    pages_viewed: number;
  }> => {
    const response = await apiClient.post(`/papers/${id}/reading-session/end`, updates || {});
    return response.data;
  },

  listBookmarks: async (id: number): Promise<Array<{
    id: number;
    paper_id: number;
    page_number: number;
    note?: string;
    created_at: string;
  }>> => {
    const response = await apiClient.get(`/papers/${id}/bookmarks`);
    return response.data;
  },

  createBookmark: async (id: number, page_number: number, note?: string): Promise<{
    id: number;
    paper_id: number;
    page_number: number;
    note?: string;
    created_at: string;
  }> => {
    const response = await apiClient.post(`/papers/${id}/bookmarks`, { paper_id: id, page_number, note });
    return response.data;
  },

  deleteBookmark: async (id: number, bookmark_id: number): Promise<void> => {
    await apiClient.delete(`/papers/${id}/bookmarks/${bookmark_id}`);
  },

  getCitationGraph: async (
    id: number,
    bidirectional: boolean = true,
    maxHops: number = 1
  ): Promise<CitationGraph> => {
    const response = await apiClient.get<CitationGraph>(
      `/papers/${id}/citation-graph?bidirectional=${bidirectional}&max_hops=${maxHops}`
    );
    return response.data;
  },

  getCitationsList: async (id: number): Promise<{ citations: Citation[] }> => {
    const response = await apiClient.get<{ citations: Citation[] }>(`/papers/${id}/citations-list`);
    return response.data;
  },

  ingestBatch: async (urls: string[], groupIds?: number[]): Promise<BatchIngestionResponse> => {
    const response = await apiClient.post<BatchIngestionResponse>('/ingest/batch', {
      urls,
      group_ids: groupIds && groupIds.length > 0 ? groupIds : undefined,
    });
    return response.data;
  },

  ingestFromText: async (text: string, groupIds?: number[]): Promise<BatchIngestionResponse> => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const params = new URLSearchParams();
    if (groupIds && groupIds.length > 0)
    {
      params.append('group_ids', groupIds.join(','));
    }
    const url = `${API_BASE_URL}/ingest/urls${params.toString() ? `?${params.toString()}` : ''}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: text,
    });

    if (!response.ok)
    {
      const errorData = await response.json().catch(() => ({ detail: 'Failed to ingest URLs' }));
      throw new Error(errorData.detail || 'Failed to ingest URLs');
    }

    return response.json();
  },
};

