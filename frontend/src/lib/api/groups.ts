import apiClient from './client';
import type { Paper } from './papers';
import { papersApi } from './papers';

export type { Paper } from './papers';

export interface Group {
  id: number;
  name: string;
  parent_id?: number;
  created_at: string;
  updated_at: string;
  papers?: Paper[];
  children?: Group[];
}

export interface GroupCreate {
  name: string;
  parent_id?: number;
}

export interface GroupUpdate {
  name?: string;
  parent_id?: number;
}

export const groupsApi = {
  list: async (): Promise<Group[]> => {
    const response = await apiClient.get<Group[]>('/groups');
    return response.data;
  },

  get: async (id: number): Promise<Group> => {
    const response = await apiClient.get<Group>(`/groups/${id}`);
    return response.data;
  },

  create: async (group: GroupCreate): Promise<Group> => {
    const response = await apiClient.post<Group>('/groups', group);
    return response.data;
  },

  update: async (id: number, updates: GroupUpdate): Promise<Group> => {
    const response = await apiClient.patch<Group>(`/groups/${id}`, updates);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/groups/${id}`);
  },

  updatePaperGroups: async (paperId: number, groupIds: number[]): Promise<void> => {
    await papersApi.update(paperId, { group_ids: groupIds });
  },
};

