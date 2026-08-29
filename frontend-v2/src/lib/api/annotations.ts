import { api } from './client';

export interface Annotation {
  id: number;
  paper_id: number;
  content: string;
  type?: string;
  highlighted_text?: string;
  selection_data?: Record<string, unknown>;
  note_scope?: string;
  coordinate_data?: Record<string, unknown>;
  auto_highlighted?: boolean;
  highlight_type?: string;
  created_at: string;
  updated_at: string;
}

export interface AnnotationCreate {
  paper_id: number;
  content: string;
  type?: string;
  highlighted_text?: string;
  selection_data?: Record<string, unknown>;
  note_scope?: string;
  coordinate_data?: Record<string, unknown>;
}

export interface AnnotationUpdate {
  content?: string;
  type?: string;
  highlighted_text?: string;
  selection_data?: Record<string, unknown>;
  note_scope?: string;
  coordinate_data?: Record<string, unknown>;
}

export type ExplanationAction = 'explain' | 'why' | 'define';
export type ExplanationVisibility = 'private' | 'paper';
export type ExplanationStatus = 'queued' | 'generating' | 'ready' | 'failed' | 'expired';

export interface AnnotationExplanation {
  id: number;
  annotation_id: number;
  action: ExplanationAction;
  status: ExplanationStatus;
  visibility: ExplanationVisibility;
  generation: number;
  anchor: {
    version: 1;
    page: number;
    quoted_text: string;
    rects: Array<{ left: number; top: number; width: number; height: number }>;
    prefix?: string | null;
    suffix?: string | null;
    document_revision?: string | null;
  };
  input_hash: string;
  prompt_version: string;
  provider?: string | null;
  model?: string | null;
  answer?: string | null;
  evidence: Array<Record<string, unknown>>;
  error_code?: string | null;
  retention_until: string;
  created_at: string;
  updated_at: string;
}

export const annotationsApi = {
  list: (paperId: number): Promise<Annotation[]> =>
    api.get<Annotation[]>(`/papers/${paperId}/annotations`),

  get: (id: number): Promise<Annotation> =>
    api.get<Annotation>(`/annotations/${id}`),

  create: (annotation: AnnotationCreate): Promise<Annotation> =>
    api.post<Annotation>(`/papers/${annotation.paper_id}/annotations`, annotation),

  update: (id: number, updates: AnnotationUpdate): Promise<Annotation> =>
    api.patch<Annotation>(`/annotations/${id}`, updates),

  delete: async (id: number): Promise<void> => {
    await api.delete(`/annotations/${id}`);
  },

  listExplanations: (annotationId: number): Promise<AnnotationExplanation[]> =>
    api.get<AnnotationExplanation[]>(`/annotations/${annotationId}/explanations`),

  listPaperExplanations: (paperId: number): Promise<AnnotationExplanation[]> =>
    api.get<AnnotationExplanation[]>(`/papers/${paperId}/explanations`),
};
