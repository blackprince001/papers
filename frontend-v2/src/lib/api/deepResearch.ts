import { api } from './client';

export type DeepResearchStatus =
  | 'queued'
  | 'planning'
  | 'searching'
  | 'reading'
  | 'synthesizing'
  | 'verifying'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancel_requested'
  | 'cancelled';

export type DeepResearchFollowUpMode = 'ask' | 'research';

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
  current_generation?: number;
  lifecycle_version?: number;
}

export interface DeepResearchSessionDetail extends DeepResearchSession {
  report?: string | null;
  cited_sources?: CitedSource[] | null;
  generation?: DeepResearchGenerationSummary | null;
}

export type DeepResearchVerificationStatus =
  | 'pending'
  | 'in_progress'
  | 'verified'
  | 'insufficient_evidence'
  | 'needs_attention';

export interface DeepResearchGenerationSummary {
  id: number;
  generation_number: number;
  mode: DeepResearchFollowUpMode;
  status: DeepResearchStatus;
  provider_type?: string | null;
  model?: string | null;
  scope: string;
  effort: string;
  phase: string;
  progress: number;
  source_count: number;
  verification_status: DeepResearchVerificationStatus;
  stop_reason?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface DeepResearchArchiveResponse {
  items: DeepResearchSession[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface DeepResearchMessage {
  id: number;
  session_id: number;
  generation_id: number;
  generation_number: number;
  role: 'user' | 'assistant';
  mode: DeepResearchFollowUpMode;
  content: string;
  source_ids: number[];
  verification?: string | null;
  created_at: string;
}

export interface DeepResearchFollowUpResponse {
  mode: DeepResearchFollowUpMode;
  status: DeepResearchStatus;
  generation_number: number;
  message: DeepResearchMessage;
  assistant_message?: DeepResearchMessage | null;
  session: DeepResearchSession;
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const deepResearchApi = {
  start: (
    question: string,
    idempotencyKey = createIdempotencyKey(),
  ): Promise<DeepResearchSession> =>
    api.post<DeepResearchSession>(
      '/deep-research',
      { question },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    ),

  list: (limit = 50, offset = 0): Promise<DeepResearchSession[]> =>
    api.get<DeepResearchSession[]>('/deep-research', { params: { limit, offset } }),

  archive: (q = '', limit = 20, offset = 0): Promise<DeepResearchArchiveResponse> =>
    api.get<DeepResearchArchiveResponse>('/deep-research/archive', {
      params: { q: q.trim() || undefined, limit, offset },
    }),

  get: (sessionId: number): Promise<DeepResearchSessionDetail> =>
    api.get<DeepResearchSessionDetail>(`/deep-research/${sessionId}`),

  messages: (sessionId: number): Promise<DeepResearchMessage[]> =>
    api.get<DeepResearchMessage[]>(`/deep-research/${sessionId}/messages`),

  followUp: (
    sessionId: number,
    mode: DeepResearchFollowUpMode,
    question: string,
    idempotencyKey = createIdempotencyKey(),
  ): Promise<DeepResearchFollowUpResponse> =>
    api.post<DeepResearchFollowUpResponse>(
      `/deep-research/${sessionId}/messages`,
      { mode, question },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    ),

  remove: (sessionId: number): Promise<{ message: string; id: number }> =>
    api.delete<{ message: string; id: number }>(`/deep-research/${sessionId}`),

  cancel: (sessionId: number): Promise<DeepResearchSession> =>
    api.post<DeepResearchSession>(`/deep-research/${sessionId}/cancel`),

  resume: (sessionId: number): Promise<DeepResearchSession> =>
    api.post<DeepResearchSession>(`/deep-research/${sessionId}/resume`),
};

export default deepResearchApi;
