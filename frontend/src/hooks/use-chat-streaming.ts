import { useState, useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { chatApi, type ChatSession, type ChatMessage, type ChatReferences } from '@/lib/api/chat';
import { toastError } from '@/lib/utils/toast';

interface UseChatStreamingProps {
  paperId: number;
  currentSessionId: number | null;
  setCurrentSessionId: (id: number | null) => void;
}

interface UseChatStreamingReturn {
  isStreaming: boolean;
  streamingContent: string;
  displayContent: string;
  pendingUserMessage: { content: string; references: ChatReferences } | null;
  sendMessage: (message: string, references: ChatReferences) => Promise<void>;
  cancelStream: () => void;
}

// Balanced for readability while feeling responsive
// ~12 words/second provides smooth flow without feeling sluggish
const WORDS_PER_SECOND = 12;
const WORD_REVEAL_DELAY_MS = 1000 / WORDS_PER_SECOND; // ~83ms per word

/**
 * Hook to manage chat message streaming with smooth word-by-word reveal.
 */
export function useChatStreaming({
  paperId,
  currentSessionId,
  setCurrentSessionId,
}: UseChatStreamingProps): UseChatStreamingReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [displayContent, setDisplayContent] = useState('');
  const [pendingUserMessage, setPendingUserMessage] = useState<{
    content: string;
    references: ChatReferences;
  } | null>(null);

  const queryClient = useQueryClient();
  const isStreamingRef = useRef(false);
  const streamingSessionIdRef = useRef<number | null>(null);
  const displayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Smooth streaming effect - gradually reveal content word-by-word
  useEffect(() => {
    if (streamingContent.length > displayContent.length)
    {
      // Clear any existing interval
      if (displayIntervalRef.current)
      {
        clearInterval(displayIntervalRef.current);
      }

      // Reveal words gradually to match human cognitive processing rate
      displayIntervalRef.current = setInterval(() => {
        setDisplayContent(prev => {
          if (prev.length >= streamingContent.length)
          {
            if (displayIntervalRef.current)
            {
              clearInterval(displayIntervalRef.current);
              displayIntervalRef.current = null;
            }
            return prev;
          }

          // Find the next word boundary in streamingContent
          const remainingContent = streamingContent.slice(prev.length);

          // Match whitespace followed by non-whitespace (next word) or end of string
          const wordMatch = remainingContent.match(/^(\s*\S+)/);

          if (wordMatch)
          {
            // Reveal up to and including the next word
            return prev + wordMatch[1];
          }
          else
          {
            // Reveal any remaining whitespace
            return streamingContent;
          }
        });
      }, WORD_REVEAL_DELAY_MS);
    }

    return () => {
      if (displayIntervalRef.current)
      {
        clearInterval(displayIntervalRef.current);
        displayIntervalRef.current = null;
      }
    };
  }, [streamingContent]);

  // Reset state when session changes (but not during streaming)
  useEffect(() => {
    if (isStreamingRef.current)
    {
      streamingSessionIdRef.current = currentSessionId;
      return;
    }

    setPendingUserMessage(null);
    setStreamingContent('');
    setDisplayContent('');
    setIsStreaming(false);
  }, [currentSessionId]);

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current)
    {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isStreamingRef.current = false;
    streamingSessionIdRef.current = null;
    setStreamingContent('');
    setDisplayContent('');
    setIsStreaming(false);
    setPendingUserMessage(null);
  }, []);

  const sendMessage = useCallback(async (userMessage: string, userReferences: ChatReferences) => {
    if (!userMessage.trim() || isStreaming) return;

    // Show user message immediately (optimistic update)
    setPendingUserMessage({ content: userMessage, references: userReferences });

    setIsStreaming(true);
    isStreamingRef.current = true;
    streamingSessionIdRef.current = currentSessionId;
    setStreamingContent('');
    setDisplayContent('');

    let accumulatedResponse = '';

    try
    {
      // Start streaming
      for await (const chunk of chatApi.streamMessage(
        paperId,
        userMessage,
        userReferences,
        currentSessionId || undefined
      ))
      {
        if (chunk.type === 'chunk' && chunk.content)
        {
          accumulatedResponse += chunk.content;
          setStreamingContent((prev) => prev + chunk.content);
        }
        else if (chunk.type === 'done')
        {
          const finalSessionId = chunk.session_id || currentSessionId;
          const fullResponse = accumulatedResponse;

          // Wait for reveal animation to complete
          await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              setDisplayContent(currentDisplay => {
                if (currentDisplay.length >= fullResponse.length)
                {
                  clearInterval(checkInterval);
                  resolve();
                }
                return currentDisplay;
              });
            }, 100);

            // Safety timeout
            setTimeout(() => {
              clearInterval(checkInterval);
              resolve();
            }, 60000);
          });

          // Update cache with new messages
          if (finalSessionId)
          {
            queryClient.setQueryData<ChatSession>(['chat', 'session', finalSessionId], (oldSession) => {
              if (!oldSession) return oldSession;

              const newUserMsg: ChatMessage = {
                id: Date.now(),
                session_id: finalSessionId,
                role: 'user',
                content: userMessage,
                references: userReferences,
                created_at: new Date().toISOString(),
                parent_message_id: null,
                thread_count: 0
              };

              const newAssistantMsg: ChatMessage = {
                id: Date.now() + 1,
                session_id: finalSessionId,
                role: 'assistant',
                content: fullResponse,
                created_at: new Date().toISOString(),
                parent_message_id: null,
                thread_count: 0
              };

              return {
                ...oldSession,
                messages: [...(oldSession.messages || []), newUserMsg, newAssistantMsg]
              };
            });
          }

          // Reset streaming state
          isStreamingRef.current = false;
          streamingSessionIdRef.current = null;
          setStreamingContent('');
          setDisplayContent('');
          setIsStreaming(false);
          setPendingUserMessage(null);

          if (chunk.session_id && currentSessionId === null)
          {
            setCurrentSessionId(chunk.session_id);
          }

          // Background refresh
          setTimeout(() => {
            if (finalSessionId)
            {
              queryClient.invalidateQueries({ queryKey: ['chat', 'session', finalSessionId] });
            }
            queryClient.invalidateQueries({ queryKey: ['chat', 'sessions', paperId] });
            queryClient.invalidateQueries({ queryKey: ['chat', 'latest', paperId] });
          }, 100);
        }
        else if (chunk.type === 'error')
        {
          isStreamingRef.current = false;
          streamingSessionIdRef.current = null;
          setStreamingContent('');
          setDisplayContent('');
          setIsStreaming(false);
          setPendingUserMessage(null);
          toastError(`Error: ${chunk.error || 'Failed to get response'}`);
          queryClient.invalidateQueries({ queryKey: ['chat', 'session', currentSessionId] });
        }
      }
    }
    catch (error)
    {
      isStreamingRef.current = false;
      streamingSessionIdRef.current = null;
      setStreamingContent('');
      setDisplayContent('');
      setIsStreaming(false);
      setPendingUserMessage(null);
      toastError(`Error: ${error instanceof Error ? error.message : 'Failed to send message'}`);
      queryClient.invalidateQueries({ queryKey: ['chat', 'session', currentSessionId] });
    }
  }, [paperId, currentSessionId, isStreaming, queryClient, setCurrentSessionId]);

  return {
    isStreaming,
    streamingContent,
    displayContent,
    pendingUserMessage,
    sendMessage,
    cancelStream,
  };
}
