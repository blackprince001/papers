import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi, type ChatSession } from '@/lib/api/chat';

interface UseChatSessionsProps {
  paperId: number;
}

interface UseChatSessionsReturn {
  sessions: ChatSession[];
  currentSessionId: number | null;
  currentSession: ChatSession | undefined;
  isLoading: boolean;
  setCurrentSessionId: (id: number | null) => void;
  createSession: (name?: string) => Promise<ChatSession>;
  deleteSession: (sessionId: number) => Promise<void>;
  renameSession: (sessionId: number, name: string) => Promise<void>;
  clearSessionMessages: (sessionId: number) => Promise<void>;
}

/**
 * Hook to manage chat sessions for a paper.
 * Handles fetching, creating, deleting, and renaming sessions.
 */
export function useChatSessions({ paperId }: UseChatSessionsProps): UseChatSessionsReturn {
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  // Fetch all sessions for this paper
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['chat', 'sessions', paperId],
    queryFn: () => chatApi.getSessions(paperId),
    retry: false,
  });

  // Fetch latest session (only if exists, doesn't create)
  const { data: latestSession, isLoading: initialLoading } = useQuery({
    queryKey: ['chat', 'latest', paperId],
    queryFn: () => chatApi.getHistory(paperId),
    retry: false,
    enabled: currentSessionId === null,
  });

  // Fetch specific session history
  const { data: currentSession, isLoading: sessionLoading } = useQuery({
    queryKey: ['chat', 'session', currentSessionId],
    queryFn: () => chatApi.getSession(currentSessionId!),
    enabled: currentSessionId !== null,
    retry: false,
  });

  // Effect to set initial session ID from latest session or first available session
  useEffect(() => {
    if (currentSessionId !== null) return;

    if (latestSession)
    {
      setCurrentSessionId(latestSession.id);
    } else if (!initialLoading && sessions.length > 0)
    {
      setCurrentSessionId(sessions[0].id);
    }
  }, [latestSession, currentSessionId, initialLoading, sessions]);

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: (name?: string) => chatApi.createSession(paperId, name || 'New Session'),
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'sessions', paperId] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'latest', paperId] });
      setCurrentSessionId(newSession.id);
    },
  });

  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: number) => chatApi.deleteSession(sessionId),
    onSuccess: (_, deletedSessionId) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'sessions', paperId] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'session', deletedSessionId] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'latest', paperId] });

      if (currentSessionId === deletedSessionId)
      {
        queryClient.invalidateQueries({ queryKey: ['chat', 'sessions', paperId] });
        setCurrentSessionId(null);
      }
    },
  });

  // Rename session mutation
  const renameSessionMutation = useMutation({
    mutationFn: ({ id, name }: { id: number, name: string }) => chatApi.updateSession(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'sessions', paperId] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'session', currentSessionId] });
    },
  });

  // Clear session messages mutation
  const clearMessagesMutation = useMutation({
    mutationFn: (sessionId: number) => chatApi.clearSessionMessages(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'session', currentSessionId] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'latest', paperId] });
    },
  });

  return {
    sessions,
    currentSessionId,
    currentSession: currentSession || latestSession || undefined,
    isLoading: sessionsLoading || initialLoading || sessionLoading,
    setCurrentSessionId,
    createSession: async (name?: string) => {
      return createSessionMutation.mutateAsync(name);
    },
    deleteSession: async (sessionId: number) => {
      await deleteSessionMutation.mutateAsync(sessionId);
    },
    renameSession: async (sessionId: number, name: string) => {
      await renameSessionMutation.mutateAsync({ id: sessionId, name });
    },
    clearSessionMessages: async (sessionId: number) => {
      await clearMessagesMutation.mutateAsync(sessionId);
    },
  };
}
