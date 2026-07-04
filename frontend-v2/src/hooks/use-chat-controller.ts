import { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChatSessions } from '@/hooks/use-chat-sessions';
import { useChatStream } from '@/hooks/use-chat-stream';
import { type ChatMessage, type ChatReferences } from '@/lib/api/chat';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { toastChatError, toastError, toastInfo, toastSuccess } from '@/lib/utils/toast';


export function useChatController(paperId: number) {
  const queryClient = useQueryClient();
  const {
    sessions,
    currentSessionId,
    messages,
    isLoading,
    setCurrentSessionId,
    switchSession: switchSessionRaw,
    createSession,
    deleteSession,
    renameSession,
  } = useChatSessions(paperId);

  const [sessionSwitchToken, setSessionSwitchToken] = useState(0);
  const switchSession = useCallback(
    (id: number) => {
      setSessionSwitchToken((t) => t + 1);
      switchSessionRaw(id);
    },
    [switchSessionRaw],
  );

  const [input, setInput] = useState('');
  const [references, setReferences] = useState<ChatReferences>({ notes: [], annotations: [], papers: [] });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<number | null>(null);

  const [composerHidden, setComposerHidden] = useState(false);

  const { confirm, dialogProps } = useConfirmDialog();

  const stream = useChatStream();
  const {
    status,
    content,
    sessionId: responseSessionId,
    send,
    cancel,
    isActive,
  } = stream;

  useEffect(() => {
    if (stream.error && !isActive) {
      if (stream.autoRetryAt) {
        const seconds = Math.max(1, Math.ceil((stream.autoRetryAt - Date.now()) / 1000));
        toastInfo('Rate limit reached', `Retrying automatically in ${seconds}s…`);
      } else {
        toastChatError(stream.error.code, stream.error.message);
      }
    }
  }, [stream.error, stream.autoRetryAt, isActive]);

  // Abort mid-stream when session switches
  useEffect(() => {
    if (isActive) cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  // Adopt the session ID assigned by the backend on a fresh conversation
  useEffect(() => {
    if (status === 'done' && currentSessionId == null && responseSessionId) {
      setCurrentSessionId(responseSessionId);
    }
  }, [status, currentSessionId, responseSessionId, setCurrentSessionId]);

  // Hold onto the last sent message/refs so the optimistic cache can use them
  const lastUserMessageRef = useRef<string | null>(null);
  const lastReferencesRef = useRef<ChatReferences | null>(null);

  // Optimistic cache update once a turn completes
  useEffect(() => {
    if (status === 'done' && content && lastUserMessageRef.current) {
      const finalSessionId = responseSessionId || currentSessionId;
      if (finalSessionId) {
        queryClient.setQueryData(['chat', 'session', finalSessionId], (oldSession: any) => {
          if (!oldSession) return oldSession;
          const newUserMsg: ChatMessage = {
            id: Date.now(),
            session_id: finalSessionId,
            role: 'user',
            content: lastUserMessageRef.current || '',
            references: lastReferencesRef.current || { notes: [], annotations: [], papers: [] },
            created_at: new Date().toISOString(),
            parent_message_id: null,
            thread_count: 0,
          };
          const newAssistantMsg: ChatMessage = {
            id: Date.now() + 1,
            session_id: finalSessionId,
            role: 'assistant',
            content,
            created_at: new Date().toISOString(),
            parent_message_id: null,
            thread_count: 0,
          };
          return { ...oldSession, messages: [...(oldSession.messages || []), newUserMsg, newAssistantMsg] };
        });
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['chat', 'session', finalSessionId], refetchType: 'none' });
          queryClient.invalidateQueries({ queryKey: ['chat', 'sessions', paperId] });
        }, 100);
      }
      lastUserMessageRef.current = null;
      lastReferencesRef.current = null;
    }
  }, [status, content, currentSessionId, responseSessionId, paperId, queryClient]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isActive) return;

    const userMessage = input.trim();
    const userReferences = { ...references };

    lastUserMessageRef.current = userMessage;
    lastReferencesRef.current = userReferences;

    setInput('');
    setReferences({ notes: [], annotations: [], papers: [] });

    send(
      paperId,
      userMessage,
      userReferences,
      currentSessionId || undefined,
      activeProviderId ?? undefined,
    );
  }, [input, references, isActive, send, paperId, currentSessionId, activeProviderId]);

  const handleCreateSession = useCallback(async () => {
    if (isCreatingSession) return;
    setIsCreatingSession(true);
    try {
      await createSession();
      setSessionSwitchToken((t) => t + 1);
      toastSuccess('New session created');
    } catch {
      toastError('Failed to create session');
    } finally {
      setIsCreatingSession(false);
    }
  }, [isCreatingSession, createSession]);

  const handleDeleteSession = useCallback(async (id: number) => {
    const ok = await confirm({
      title: 'Delete Session',
      description: 'Are you sure you want to delete this chat session? This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) {
      await deleteSession(id);
      setSessionSwitchToken((t) => t + 1);
    }
  }, [confirm, deleteSession]);

  const copyMessage = useCallback(async (text: string, id: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toastError('Failed to copy to clipboard');
    }
  }, []);

  return {
    paperId,
    // sessions
    sessions,
    currentSessionId,
    sessionSwitchToken,
    switchSession,
    renameSession,
    handleCreateSession,
    handleDeleteSession,
    isCreatingSession,
    // messages
    messages,
    isLoading,
    // streaming surface (full object for ChatMessageList)
    stream,
    // composer
    input,
    setInput,
    references,
    setReferences,
    activeProviderId,
    setActiveProviderId,
    handleSend,
    composerHidden,
    setComposerHidden,
    // threads
    activeThreadId,
    setActiveThreadId,
    // misc
    copiedId,
    copyMessage,
    confirmDialogProps: dialogProps,
  };
}

export type ChatController = ReturnType<typeof useChatController>;
