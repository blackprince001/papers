import apiClient from './client';

export interface ChatMessage {
  id: number;
  session_id: number;
  role: 'user' | 'assistant';
  content: string;
  references?: Record<string, any>;
  created_at: string;
}

export interface ChatSession {
  id: number;
  paper_id: number;
  name: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface ChatRequest {
  message: string;
  references?: Record<string, any>;
  session_id?: number;
}

export interface ChatResponse {
  message: ChatMessage;
  session: ChatSession;
}

export interface ReferenceItem {
  id: number;
  type: 'note' | 'annotation' | 'paper';
  display: string;
  content?: string;
  title?: string;
}

export type StreamChunk = {
  type: 'chunk' | 'done' | 'error';
  content?: string;
  message_id?: number;
  session_id?: number;
  error?: string;
};

export const chatApi = {
  sendMessage: async (paperId: number, message: string, references?: Record<string, any>, sessionId?: number): Promise<ChatResponse> => {
    const response = await apiClient.post<ChatResponse>(`/papers/${paperId}/chat`, {
      message,
      references: references || {},
      session_id: sessionId,
    });
    return response.data;
  },

  streamMessage: async function* (
    paperId: number,
    message: string,
    references?: Record<string, any>,
    sessionId?: number
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const url = `${API_BASE_URL}/papers/${paperId}/chat/stream`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        references: references || {},
        session_id: sessionId,
      }),
    });

    if (!response.ok)
    {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader)
    {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try
    {
      while (true)
      {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines)
        {
          if (line.startsWith('data: '))
          {
            try
            {
              const data = JSON.parse(line.slice(6));
              yield data as StreamChunk;
            } catch (e)
            {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.startsWith('data: '))
      {
        try
        {
          const data = JSON.parse(buffer.slice(6));
          yield data as StreamChunk;
        } catch (e)
        {
          console.error('Failed to parse SSE data:', e);
        }
      }
    } finally
    {
      reader.releaseLock();
    }
  },

  getHistory: async (paperId: number): Promise<ChatSession | null> => {
    const response = await apiClient.get<ChatSession | null>(`/papers/${paperId}/chat`);
    return response.data;
  },

  getSession: async (sessionId: number): Promise<ChatSession> => {
    const response = await apiClient.get<ChatSession>(`/sessions/${sessionId}`);
    return response.data;
  },

  getSessions: async (paperId: number): Promise<ChatSession[]> => {
    const response = await apiClient.get<ChatSession[]>(`/papers/${paperId}/sessions`);
    return response.data;
  },

  createSession: async (paperId: number, name?: string): Promise<ChatSession> => {
    const response = await apiClient.post<ChatSession>(`/papers/${paperId}/sessions`, name ? { name } : {});
    return response.data;
  },

  updateSession: async (sessionId: number, name: string): Promise<ChatSession> => {
    const response = await apiClient.patch<ChatSession>(`/sessions/${sessionId}`, { name });
    return response.data;
  },

  deleteSession: async (sessionId: number): Promise<void> => {
    await apiClient.delete(`/sessions/${sessionId}`);
  },

  clearHistory: async (paperId: number): Promise<void> => {
    await apiClient.delete(`/papers/${paperId}/chat`);
  },

  clearSessionMessages: async (sessionId: number): Promise<void> => {
    await apiClient.delete(`/sessions/${sessionId}/messages`);
  },
};
