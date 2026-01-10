import apiClient from './client';

export interface ExportRequest {
  paper_ids: number[];
  format: 'csv' | 'json' | 'ris' | 'endnote';
  include_annotations?: boolean;
}

export interface CitationExportRequest {
  paper_ids: number[];
  format: 'apa' | 'mla' | 'bibtex';
}

export const exportApi = {
  exportPapers: async (request: ExportRequest): Promise<Blob> => {
    const response = await apiClient.post('/papers/export', request, {
      responseType: 'blob',
    });
    return response.data;
  },

  exportCitations: async (request: CitationExportRequest): Promise<Blob> => {
    const response = await apiClient.post('/papers/export/citations', request, {
      responseType: 'blob',
    });
    return response.data;
  },

  generateBibliography: async (
    paperIds: number[],
    format: 'apa' | 'mla' | 'bibtex' | 'chicago' | 'ieee'
  ): Promise<Blob> => {
    // Build query string manually to ensure proper array serialization for FastAPI
    const params = new URLSearchParams();
    paperIds.forEach(id => params.append('paper_ids', id.toString()));
    params.append('format', format);
    
    const response = await apiClient.post(
      `/papers/export/bibliography?${params.toString()}`,
      null,
      {
        responseType: 'blob',
      }
    );
    return response.data;
  },
};

