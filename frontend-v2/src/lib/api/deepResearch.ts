import { api } from './client';

export type DeepResearchStatus = 'running' | 'paused' | 'completed' | 'failed';

export interface CitedSource {
  title: string;
  url?: string | null;
  source?: string | null;
  external_id?: string | null;
  /** "academic" (arXiv/Semantic Scholar/Scholar) | "web" (OpenAlex). */
  type?: 'academic' | 'web' | string | null;
  authors?: string[] | string | null;
  year?: number | null;
  citation_count?: number | null;
  pdf_url?: string | null;
}

export interface DeepResearchSession {
  id: number;
  question: string;
  title?: string | null;
  status: DeepResearchStatus;
  last_error_code?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeepResearchSessionDetail extends DeepResearchSession {
  report?: string | null;
  cited_sources?: CitedSource[] | null;
}

export const deepResearchApi = {
  start: (question: string): Promise<DeepResearchSession> =>
    api.post<DeepResearchSession>('/deep-research', { question }),

  list: (limit = 50, offset = 0): Promise<DeepResearchSession[]> =>
    api.get<DeepResearchSession[]>('/deep-research', { params: { limit, offset } }),

  get: (sessionId: number): Promise<DeepResearchSessionDetail> =>
    api.get<DeepResearchSessionDetail>(`/deep-research/${sessionId}`),

  remove: (sessionId: number): Promise<{ message: string; id: number }> =>
    api.delete<{ message: string; id: number }>(`/deep-research/${sessionId}`),

  resume: (sessionId: number): Promise<DeepResearchSession> =>
    api.post<DeepResearchSession>(`/deep-research/${sessionId}/resume`),
};

export default deepResearchApi;
