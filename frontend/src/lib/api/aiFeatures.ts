import { api } from './client';

export interface SummaryResponse {
  summary: string;
  generated_at?: string;
}

export interface FindingsResponse {
  findings: {
    key_findings?: string[];
    conclusions?: string[];
    methodology?: string;
    limitations?: string[];
    future_work?: string[];
  };
}

export interface ReadingGuideResponse {
  guide: {
    pre_reading?: string[];
    during_reading?: string[];
    post_reading?: string[];
  };
}

export const aiFeaturesApi = {
  generateSummary: async (paperId: number): Promise<SummaryResponse> => {
    return api.post<SummaryResponse>(`/papers/${paperId}/generate-summary`);
  },

  getSummary: async (paperId: number): Promise<SummaryResponse> => {
    return api.get<SummaryResponse>(`/papers/${paperId}/summary`);
  },

  updateSummary: async (paperId: number, summary: string): Promise<SummaryResponse> => {
    return api.put<SummaryResponse>(`/papers/${paperId}/summary`, { summary });
  },

  extractFindings: async (paperId: number): Promise<FindingsResponse> => {
    return api.post<FindingsResponse>(`/papers/${paperId}/extract-findings`);
  },

  getFindings: async (paperId: number): Promise<FindingsResponse> => {
    return api.get<FindingsResponse>(`/papers/${paperId}/findings`);
  },

  updateFindings: async (paperId: number, findings: any): Promise<FindingsResponse> => {
    return api.put<FindingsResponse>(`/papers/${paperId}/findings`, { findings });
  },

  generateReadingGuide: async (paperId: number): Promise<ReadingGuideResponse> => {
    return api.post<ReadingGuideResponse>(`/papers/${paperId}/generate-reading-guide`);
  },

  getReadingGuide: async (paperId: number): Promise<ReadingGuideResponse> => {
    return api.get<ReadingGuideResponse>(`/papers/${paperId}/reading-guide`);
  },

  updateReadingGuide: async (paperId: number, guide: any): Promise<ReadingGuideResponse> => {
    return api.put<ReadingGuideResponse>(`/papers/${paperId}/reading-guide`, { guide });
  },

  generateHighlights: async (paperId: number): Promise<{ message: string; count: number }> => {
    return api.post(`/papers/${paperId}/generate-highlights`);
  },
};
