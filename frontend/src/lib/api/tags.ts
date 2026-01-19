import { api } from './client';

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
    if (search)
    {
      params.append('search', search);
    }
    return api.get<TagListResponse>(`/tags?${params}`);
  },

  get: async (id: number): Promise<Tag> => {
    return api.get<Tag>(`/tags/${id}`);
  },

  create: async (name: string): Promise<Tag> => {
    return api.post<Tag>('/tags', { name });
  },

  update: async (id: number, name: string): Promise<Tag> => {
    return api.patch<Tag>(`/tags/${id}`, { name });
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/tags/${id}`);
  },
};
