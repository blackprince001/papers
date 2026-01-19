import { api } from './client';
import type { Paper } from './papers';

export interface DuplicateMatch {
  paper: Paper;
  confidence_score: number;
  detection_method: string;
}

export interface MergeRequest {
  primary_paper_id: number;
  duplicate_paper_id: number;
}

export interface MergePreview {
  primary_paper: Paper;
  duplicate_paper: Paper;
  annotations_to_merge: number;
  tags_to_add: number;
  groups_to_add: number;
}

export const duplicatesApi = {
  findDuplicates: async (paperId: number, threshold: number = 0.8): Promise<DuplicateMatch[]> => {
    return api.post<DuplicateMatch[]>(
      `/papers/${paperId}/find-duplicates`,
      null,
      { params: { threshold } }
    );
  },

  mergePapers: async (request: MergeRequest): Promise<Paper> => {
    return api.post<Paper>('/papers/merge', request);
  },

  getMergePreview: async (
    primaryPaperId: number,
    duplicatePaperId: number
  ): Promise<MergePreview> => {
    return api.get<MergePreview>(
      `/papers/${primaryPaperId}/merge-preview`,
      { params: { duplicate_paper_id: duplicatePaperId } }
    );
  },
};
