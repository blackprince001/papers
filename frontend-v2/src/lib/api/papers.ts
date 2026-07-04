import { api, getAuthHeaders } from './client';

export interface Tag {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Paper {
  id: number;
  uploaded_by_id?: number;
  title: string;
  authors?: string;
  doi?: string;
  url?: string;
  file_path?: string;
  file_url?: string;
  content_text?: string;
  ai_summary?: string;
  metadata_json?: Record<string, unknown>;
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
  task_id?: string;
  processing_status?: 'pending' | 'processing' | 'completed' | 'failed';
  processing_error?: string;
  my_permission?: 'owner' | 'editor' | 'viewer';
  is_shared?: boolean;
  shared_by?: { id: number; display_name: string; email: string };
}

export type ProcessingStepName =
  | 'citations'
  | 'summary'
  | 'findings'
  | 'reading_guide'
  | 'highlights'
  | 'embedding'
  | 'finalize';

export type ProcessingStepStatus = 'running' | 'completed' | 'skipped' | 'failed';

export interface ProcessingProgressEvent {
  step: ProcessingStepName;
  status: ProcessingStepStatus;
  reason?: string;
  error?: string;
  count?: number;
  anchored?: number;
  citations_count?: number;
  succeeded?: number;
  skipped?: number;
  total?: number;
}

export interface PaperProcessingProgress {
  paper_id: number;
  processing_status?: 'pending' | 'processing' | 'completed' | 'failed';
  events: ProcessingProgressEvent[];
  done: boolean;
}

export interface PaperCreate {
  title: string;
  url: string;
  doi?: string;
  metadata_json?: Record<string, unknown>;
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
  citing_paper_id: number;
  cited_paper_id: number | null;
  citation_context: string | null;
  external_paper_title: string | null;
  external_paper_doi: string | null;
  created_at: string | null;
  cited_paper?: Paper;
}

export interface PaperListFilters {
  sort_by?: 'date_added' | 'viewed' | 'title' | 'authors' | 'last_read_at';
  sort_order?: 'asc' | 'desc';
  group_id?: number;
  /** Only papers that belong to no group (mutually exclusive with group_id). */
  ungrouped?: boolean;
  tag_id?: number;
  has_file?: boolean;
  date_from?: string;
  date_to?: string;
  ownership?: 'all' | 'mine' | 'shared';
}

export type ReadingStatus = 'not_started' | 'in_progress' | 'read' | 'archived';
export type PaperPriority = 'low' | 'medium' | 'high' | 'critical';

export interface ReadingSession {
  id: number;
  paper_id: number;
  start_time: string;
  end_time?: string;
  duration_minutes: number;
  pages_viewed: number;
  last_read_page?: number;
}

export interface Bookmark {
  id: number;
  paper_id: number;
  page_number: number;
  note?: string;
  created_at: string;
}

export const papersApi = {
  /** Papers the user opened most recently (server-side recents). */
  getRecent: (limit = 10): Promise<PaperListResponse> =>
    api.get<PaperListResponse>('/papers/recent', { params: { limit } }),

  list: (page = 1, pageSize = 20, search?: string, filters?: PaperListFilters): Promise<PaperListResponse> => {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
    });
    if (search) params.append('search', search);
    if (filters) {
      if (filters.sort_by) params.append('sort_by', filters.sort_by);
      if (filters.sort_order) params.append('sort_order', filters.sort_order);
      if (filters.group_id !== undefined) params.append('group_id', filters.group_id.toString());
      if (filters.ungrouped) params.append('ungrouped', 'true');
      if (filters.has_file !== undefined) params.append('has_file', filters.has_file.toString());
      if (filters.tag_id !== undefined) params.append('tag_id', filters.tag_id.toString());
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      if (filters.ownership && filters.ownership !== 'all') params.append('ownership', filters.ownership);
    }
    return api.get<PaperListResponse>(`/papers?${params}`);
  },

  get: (id: number): Promise<Paper> =>
    api.get<Paper>(`/papers/${id}`),

  getProgress: (id: number): Promise<PaperProcessingProgress> =>
    api.get<PaperProcessingProgress>(`/papers/${id}/progress`),

  create: (paper: PaperCreate): Promise<Paper> =>
    api.post<Paper>('/ingest', paper),

  update: (id: number, updates: Partial<PaperCreate> & { tag_ids?: number[]; group_ids?: number[] }): Promise<Paper> =>
    api.patch<Paper>(`/papers/${id}`, updates),

  delete: async (id: number): Promise<void> => {
    await api.delete(`/papers/${id}`);
  },

  deleteBulk: async (ids: number[]): Promise<void> => {
    if (ids.length === 0) return;
    const params = new URLSearchParams();
    ids.forEach((id) => params.append('paper_ids', id.toString()));
    await api.delete(`/papers?${params.toString()}`);
  },

  getReference: (id: number, format: 'apa' | 'mla' | 'bibtex' = 'apa'): Promise<PaperReference> =>
    api.get<PaperReference>(`/papers/${id}/reference?format=${format}`),

  /** Fetch the stored PDF (authenticated) and trigger a browser download. */
  downloadFile: async (id: number, filename?: string): Promise<void> => {
    const blob = await api.get<Blob>(`/papers/${id}/file`, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename ? `${filename}.pdf` : `paper-${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  },

  uploadFiles: (files: File[], groupIds?: number[]): Promise<PaperUploadResponse> => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    if (groupIds && groupIds.length > 0) {
      formData.append('group_ids', JSON.stringify(groupIds));
    }
    return api.post<PaperUploadResponse>('/ingest/upload', formData);
  },

  uploadFilesWithProgress: (
    files: File[],
    groupIds: number[] | undefined,
    onProgress: (loaded: number, total: number) => void,
  ): Promise<PaperUploadResponse> => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const baseUrl = API_BASE_URL.replace(/\/$/, '');

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    if (groupIds && groupIds.length > 0) {
      formData.append('group_ids', JSON.stringify(groupIds));
    }

    return new Promise<PaperUploadResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${baseUrl}/ingest/upload`);
      xhr.withCredentials = true;

      Object.entries(getAuthHeaders()).forEach(([k, v]) => xhr.setRequestHeader(k, v));

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as PaperUploadResponse);
          } catch {
            reject(new Error('Invalid server response'));
          }
        } else {
          let message = `HTTP ${xhr.status}`;
          try {
            const data = JSON.parse(xhr.responseText) as { detail?: string };
            if (data?.detail) message = data.detail;
          } catch {
            /* keep default */
          }
          reject(new Error(message));
        }
      };

      xhr.onerror = () => reject(new Error('Network error: Could not reach server'));
      xhr.onabort = () => reject(new Error('Upload aborted'));

      xhr.send(formData);
    });
  },

  getRelated: (id: number): Promise<RelatedPapersResponse> =>
    api.get<RelatedPapersResponse>(`/papers/${id}/related`),

  regenerateMetadata: (id: number): Promise<Paper> =>
    api.post<Paper>(`/papers/${id}/regenerate-metadata`),

  regenerateMetadataBulk: (paperIds: number[]): Promise<{ successful: number[]; failed: Array<{ paper_id: number; error: string }> }> =>
    api.post('/papers/regenerate-metadata-bulk', { paper_ids: paperIds }),

  extractCitations: (id: number): Promise<{ paper_id: number; citations_extracted: number }> =>
    api.post(`/papers/${id}/extract-citations`),

  updateReadingStatus: (id: number, reading_status: ReadingStatus): Promise<Paper> =>
    api.patch<Paper>(`/papers/${id}/reading-status`, { reading_status }),

  updatePriority: (id: number, priority: PaperPriority): Promise<Paper> =>
    api.patch<Paper>(`/papers/${id}/priority`, { priority }),

  getReadingProgress: (id: number): Promise<{
    paper_id: number;
    reading_status: string;
    reading_time_minutes: number;
    last_read_page?: number;
    priority: string;
    status_updated_at?: string;
    last_read_at?: string;
  }> => api.get(`/papers/${id}/reading-progress`),

  startReadingSession: (id: number): Promise<ReadingSession> =>
    api.post(`/papers/${id}/reading-session/start`),

  endReadingSession: (id: number, updates?: Partial<Omit<ReadingSession, 'id' | 'paper_id' | 'start_time'>>): Promise<ReadingSession> =>
    api.post(`/papers/${id}/reading-session/end`, updates ?? {}),

  listBookmarks: (id: number): Promise<Bookmark[]> =>
    api.get(`/papers/${id}/bookmarks`),

  createBookmark: (id: number, page_number: number, note?: string): Promise<Bookmark> =>
    api.post(`/papers/${id}/bookmarks`, { paper_id: id, page_number, note }),

  deleteBookmark: async (id: number, bookmark_id: number): Promise<void> => {
    await api.delete(`/papers/${id}/bookmarks/${bookmark_id}`);
  },

  updateBookmark: (id: number, updates: { note?: string }): Promise<Bookmark> =>
    api.patch<Bookmark>(`/papers/bookmarks/${id}`, updates),

  getCitationGraph: (id: number, bidirectional = true, maxHops = 1): Promise<CitationGraph> =>
    api.get<CitationGraph>(`/papers/${id}/citation-graph?bidirectional=${bidirectional}&max_hops=${maxHops}`),

  getCitationsList: (id: number): Promise<{ citations: Citation[] }> =>
    api.get<{ citations: Citation[] }>(`/papers/${id}/citations-list`),

  ingestBatch: (urls: string[], groupIds?: number[]): Promise<BatchIngestionResponse> =>
    api.post<BatchIngestionResponse>('/ingest/batch', {
      urls,
      group_ids: groupIds && groupIds.length > 0 ? groupIds : undefined,
    }),

  ingestFromText: async (text: string, groupIds?: number[]): Promise<BatchIngestionResponse> => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const params = new URLSearchParams();
    if (groupIds && groupIds.length > 0) {
      params.append('group_ids', groupIds.join(','));
    }
    const url = `${API_BASE_URL}/ingest/urls${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', ...getAuthHeaders() },
      body: text,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Failed to ingest URLs' }));
      throw new Error(errorData.detail || 'Failed to ingest URLs');
    }
    return response.json();
  },

  /** PDF layout blocks in the @extend ParsedOcrOutput envelope. */
  getLayout: (id: number): Promise<{ chunks: Array<{ blocks: unknown[] }> }> =>
    api.get(`/papers/${id}/layout`),
};
