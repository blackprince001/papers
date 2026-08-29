import { api } from './client';
import type { Annotation } from './annotations';

export interface SummaryResponse {
  summary: string;
  generated_at?: string;
  status: string;
}

export interface FindingsResponse {
  findings: {
    key_findings?: string[];
    conclusions?: string[];
    methodology?: string;
    limitations?: string[];
    future_work?: string[];
  };
  generated_at?: string;
  status: string;
}

export interface ReadingGuideResponse {
  guide: {
    pre_reading?: string[];
    during_reading?: string[];
    post_reading?: string[];
  };
  generated_at?: string;
  status: string;
}

export const aiFeaturesApi = {
  generateSummary: (paperId: number): Promise<SummaryResponse> =>
    api.post<SummaryResponse>(`/papers/${paperId}/generate-summary`),

  getSummary: (paperId: number): Promise<SummaryResponse> =>
    api.get<SummaryResponse>(`/papers/${paperId}/summary`),

  updateSummary: (paperId: number, summary: string): Promise<SummaryResponse> =>
    api.put<SummaryResponse>(`/papers/${paperId}/summary`, { summary }),

  extractFindings: (paperId: number): Promise<FindingsResponse> =>
    api.post<FindingsResponse>(`/papers/${paperId}/extract-findings`),

  getFindings: (paperId: number): Promise<FindingsResponse> =>
    api.get<FindingsResponse>(`/papers/${paperId}/findings`),

  updateFindings: (paperId: number, findings: FindingsResponse['findings']): Promise<FindingsResponse> =>
    api.put<FindingsResponse>(`/papers/${paperId}/findings`, { findings }),

  generateReadingGuide: (paperId: number): Promise<ReadingGuideResponse> =>
    api.post<ReadingGuideResponse>(`/papers/${paperId}/generate-reading-guide`),

  getReadingGuide: (paperId: number): Promise<ReadingGuideResponse> =>
    api.get<ReadingGuideResponse>(`/papers/${paperId}/reading-guide`),

  updateReadingGuide: (paperId: number, guide: ReadingGuideResponse['guide']): Promise<ReadingGuideResponse> =>
    api.put<ReadingGuideResponse>(`/papers/${paperId}/reading-guide`, { guide }),

  generateHighlights: (paperId: number): Promise<{ message: string; count: number }> =>
    api.post(`/papers/${paperId}/generate-highlights`),

  /** Selection AI action — the answer is saved (and returned) as an annotation. */
  aiAction: (
    paperId: number,
    payload: AIActionPayload,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ): Promise<Annotation> =>
    api.post<Annotation>(`/papers/${paperId}/ai-actions`, payload, {
      headers: options.idempotencyKey
        ? { 'Idempotency-Key': options.idempotencyKey }
        : undefined,
      signal: options.signal,
    }),
};

export type AIActionKind = 'explain' | 'why' | 'define';

export interface AIActionPayload {
  action: AIActionKind;
  selection_text: string;
  page: number;
  rects: Array<{ left: number; top: number; width: number; height: number }>;
  visibility?: 'private' | 'paper';
  regenerate?: boolean;
  context?: Record<string, unknown>;
}
