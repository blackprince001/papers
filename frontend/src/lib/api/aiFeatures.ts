import apiClient from './client';

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
    const response = await apiClient.post<SummaryResponse>(`/papers/${paperId}/generate-summary`);
    return response.data;
  },

  getSummary: async (paperId: number): Promise<SummaryResponse> => {
    const response = await apiClient.get<SummaryResponse>(`/papers/${paperId}/summary`);
    return response.data;
  },

  updateSummary: async (paperId: number, summary: string): Promise<SummaryResponse> => {
    const response = await apiClient.put<SummaryResponse>(`/papers/${paperId}/summary`, { summary });
    return response.data;
  },

  extractFindings: async (paperId: number): Promise<FindingsResponse> => {
    const response = await apiClient.post<FindingsResponse>(`/papers/${paperId}/extract-findings`);
    return response.data;
  },

  getFindings: async (paperId: number): Promise<FindingsResponse> => {
    const response = await apiClient.get<FindingsResponse>(`/papers/${paperId}/findings`);
    return response.data;
  },

  updateFindings: async (paperId: number, findings: any): Promise<FindingsResponse> => {
    const response = await apiClient.put<FindingsResponse>(`/papers/${paperId}/findings`, { findings });
    return response.data;
  },

  generateReadingGuide: async (paperId: number): Promise<ReadingGuideResponse> => {
    const response = await apiClient.post<ReadingGuideResponse>(`/papers/${paperId}/generate-reading-guide`);
    return response.data;
  },

  getReadingGuide: async (paperId: number): Promise<ReadingGuideResponse> => {
    const response = await apiClient.get<ReadingGuideResponse>(`/papers/${paperId}/reading-guide`);
    return response.data;
  },

  updateReadingGuide: async (paperId: number, guide: any): Promise<ReadingGuideResponse> => {
    const response = await apiClient.put<ReadingGuideResponse>(`/papers/${paperId}/reading-guide`, { guide });
    return response.data;
  },

  generateHighlights: async (paperId: number): Promise<{ message: string; count: number }> => {
    const response = await apiClient.post(`/papers/${paperId}/generate-highlights`);
    return response.data;
  },
};

