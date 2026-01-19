import { api } from './client';

export interface Annotation {
  id: number;
  paper_id: number;
  content: string;
  type?: string;
  highlighted_text?: string;
  selection_data?: Record<string, any>;
  note_scope?: string;
  coordinate_data?: Record<string, any>;
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
  selection_data?: Record<string, any>;
  note_scope?: string;
  coordinate_data?: Record<string, any>;
}

export interface AnnotationUpdate {
  content?: string;
  type?: string;
  highlighted_text?: string;
  selection_data?: Record<string, any>;
  note_scope?: string;
  coordinate_data?: Record<string, any>;
}

export const annotationsApi = {
  list: async (paperId: number): Promise<Annotation[]> => {
    return api.get<Annotation[]>(`/papers/${paperId}/annotations`);
  },

  get: async (id: number): Promise<Annotation> => {
    return api.get<Annotation>(`/annotations/${id}`);
  },

  create: async (annotation: AnnotationCreate): Promise<Annotation> => {
    return api.post<Annotation>(
      `/papers/${annotation.paper_id}/annotations`,
      annotation
    );
  },

  update: async (id: number, updates: AnnotationUpdate): Promise<Annotation> => {
    return api.patch<Annotation>(`/annotations/${id}`, updates);
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/annotations/${id}`);
  },
};
