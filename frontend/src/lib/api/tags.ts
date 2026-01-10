import apiClient from './client';

export interface Tag {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface TagListResponse {
  tags: Tag[];
  total: number;
}

export const tagsApi = {
  list: async (page = 1, pageSize = 100, search?: string): Promise<TagListResponse> => {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
    });
    if (search) {
      params.append('search', search);
    }
    const response = await apiClient.get<TagListResponse>('/tags', { params });
    return response.data;
  },

  get: async (id: number): Promise<Tag> => {
    const response = await apiClient.get<Tag>(`/tags/${id}`);
    return response.data;
  },

  create: async (name: string): Promise<Tag> => {
    const response = await apiClient.post<Tag>('/tags', { name });
    return response.data;
  },

  update: async (id: number, name: string): Promise<Tag> => {
    const response = await apiClient.patch<Tag>(`/tags/${id}`, { name });
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/tags/${id}`);
  },
};

