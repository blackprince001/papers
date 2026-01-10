import apiClient from './client';

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
    const response = await apiClient.get<Annotation[]>(`/papers/${paperId}/annotations`);
    return response.data;
  },

  get: async (id: number): Promise<Annotation> => {
    const response = await apiClient.get<Annotation>(`/annotations/${id}`);
    return response.data;
  },

  create: async (annotation: AnnotationCreate): Promise<Annotation> => {
    const response = await apiClient.post<Annotation>(
      `/papers/${annotation.paper_id}/annotations`,
      annotation
    );
    return response.data;
  },

  update: async (id: number, updates: AnnotationUpdate): Promise<Annotation> => {
    const response = await apiClient.patch<Annotation>(`/annotations/${id}`, updates);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/annotations/${id}`);
  },
};

