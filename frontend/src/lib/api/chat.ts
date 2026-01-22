import { logger } from '../logger';
import { api } from './client';

/**
 * Properly typed chat references
 */
export interface ChatReferences {
  notes: Array<{ id: number; type: 'note'; content?: string; display?: string }>;
  annotations: Array<{ id: number; type: 'annotation'; content?: string; highlighted_text?: string; display?: string }>;
  papers: Array<{ id: number; type: 'paper'; title?: string; display?: string }>;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  role: 'user' | 'assistant';
  content: string;
  references?: ChatReferences;
  created_at: string;
  parent_message_id: number | null;
  thread_count: number;
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
  references?: ChatReferences;
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

export interface ThreadRequest {
  message: string;
  references?: ChatReferences;
}

export interface ThreadResponse {
  message: ChatMessage;
  parent_message: ChatMessage;
}

export type StreamChunk = {
  type: 'chunk' | 'done' | 'error';
  content?: string;
  message_id?: number;
  session_id?: number;
  parent_message_id?: number;
  error?: string;
};

export const chatApi = {
  sendMessage: async (paperId: number, message: string, references?: ChatReferences, sessionId?: number): Promise<ChatResponse> => {
    return api.post<ChatResponse>(`/papers/${paperId}/chat`, {
      message,
      references: references || { notes: [], annotations: [], papers: [] },
      session_id: sessionId,
    });
  },

  streamMessage: async function* (
    paperId: number,
    message: string,
    references?: ChatReferences,
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
        references: references || { notes: [], annotations: [], papers: [] },
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
              logger.warn('Failed to parse SSE data:', e);
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
          logger.warn('Failed to parse SSE data:', e);
        }
      }
    } finally
    {
      reader.releaseLock();
    }
  },

  getHistory: async (paperId: number): Promise<ChatSession | null> => {
    return api.get<ChatSession | null>(`/papers/${paperId}/chat`);
  },

  getSession: async (sessionId: number): Promise<ChatSession> => {
    return api.get<ChatSession>(`/sessions/${sessionId}`);
  },

  getSessions: async (paperId: number): Promise<ChatSession[]> => {
    return api.get<ChatSession[]>(`/papers/${paperId}/sessions`);
  },

  createSession: async (paperId: number, name?: string): Promise<ChatSession> => {
    return api.post<ChatSession>(`/papers/${paperId}/sessions`, name ? { name } : {});
  },

  updateSession: async (sessionId: number, name: string): Promise<ChatSession> => {
    return api.patch<ChatSession>(`/sessions/${sessionId}`, { name });
  },

  deleteSession: async (sessionId: number): Promise<void> => {
    await api.delete(`/sessions/${sessionId}`);
  },

  clearHistory: async (paperId: number): Promise<void> => {
    await api.delete(`/papers/${paperId}/chat`);
  },

  clearSessionMessages: async (sessionId: number): Promise<void> => {
    await api.delete(`/sessions/${sessionId}/messages`);
  },

  // Thread methods
  getThreadMessages: async (messageId: number): Promise<ChatMessage[]> => {
    return api.get<ChatMessage[]>(`/messages/${messageId}/thread`);
  },

  sendThreadMessage: async (messageId: number, message: string, references?: ChatReferences): Promise<ThreadResponse> => {
    return api.post<ThreadResponse>(`/messages/${messageId}/thread`, {
      message,
      references: references || { notes: [], annotations: [], papers: [] },
    });
  },

  streamThreadMessage: async function* (
    messageId: number,
    message: string,
    references?: ChatReferences
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const url = `${API_BASE_URL}/messages/${messageId}/thread/stream`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        references: references || { notes: [], annotations: [], papers: [] },
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
        buffer = lines.pop() || '';

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
              logger.warn('Failed to parse SSE data:', e);
            }
          }
        }
      }

      if (buffer.startsWith('data: '))
      {
        try
        {
          const data = JSON.parse(buffer.slice(6));
          yield data as StreamChunk;
        } catch (e)
        {
          logger.warn('Failed to parse SSE data:', e);
        }
      }
    } finally
    {
      reader.releaseLock();
    }
  },
};
