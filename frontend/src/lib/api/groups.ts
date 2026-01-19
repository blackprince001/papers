import { api } from './client';
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
    return api.get<Group[]>('/groups');
  },

  get: async (id: number): Promise<Group> => {
    return api.get<Group>(`/groups/${id}`);
  },

  create: async (group: GroupCreate): Promise<Group> => {
    return api.post<Group>('/groups', group);
  },

  update: async (id: number, updates: GroupUpdate): Promise<Group> => {
    return api.patch<Group>(`/groups/${id}`, updates);
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/groups/${id}`);
  },

  updatePaperGroups: async (paperId: number, groupIds: number[]): Promise<void> => {
    await papersApi.update(paperId, { group_ids: groupIds });
  },
};
