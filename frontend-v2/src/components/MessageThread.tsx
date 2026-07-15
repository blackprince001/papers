import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi, type ChatMessage } from '@/lib/api/chat';
import { chatStreamClient } from '@/lib/ai/chatStream';
import type { StreamEvent } from '@/lib/ai/chatStream';
import { MarkdownMessage } from './MarkdownMessage';
import { MessageAuthor } from '@/components/ai/MessageAuthor';
import { StreamingMessage } from './ai/StreamingMessage';
import { ExpandedInput } from './ExpandedInput';
import type { ReferenceManifestEntry } from '@/lib/api/references';
import { format } from 'date-fns';
import { ChevronDownIcon, ChevronRightIcon, SendIcon } from '@/components/icons';
import { Skeleton } from './ui/Skeleton';
import { logger } from '@/lib/logger';

interface MessageThreadProps {
  parentMessage: ChatMessage;
  showInput?: boolean;
  onCloseInput?: () => void;
}

export function MessageThread({ parentMessage, showInput = false, onCloseInput }: MessageThreadProps) {
  const [message, setMessage] = useState('');
  const [streamState, setStreamState] = useState<{
    status: 'idle' | 'connecting' | 'streaming' | 'thinking' | 'using_tool' | 'done' | 'error';
    content: string;
    displayedContent: string;
    toolCalls: StreamEvent[];
    toolResults: StreamEvent[];
    thoughts: StreamEvent[];
    currentTool: string | null;
    error: { message: string; code: string; recoverable: boolean } | null;
    messageId: number | null;
    sessionId: number | null;
    referenceManifest: ReferenceManifestEntry[] | null;
  }>({
    status: 'idle',
    content: '',
    displayedContent: '',
    toolCalls: [],
    toolResults: [],
    thoughts: [],
    currentTool: null,
    error: null,
    messageId: null,
    sessionId: null,
    referenceManifest: null,
  });

  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();
  const isStreaming = streamState.status !== 'idle' && streamState.status !== 'done' && streamState.status !== 'error';

  const { data: threadMessages = [], isLoading } = useQuery({
    queryKey: ['thread', parentMessage.id],
    queryFn: () => chatApi.getThreadMessages(parentMessage.id),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const end = messagesEndRef.current;
    if (!end) return;

    const container = end.closest('[data-chat-scroll]') as HTMLElement | null;
    if (container) {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom > 120) return;
    }
    end.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages, streamState.displayedContent, pendingUserMessage]);

  // Word-by-word display
  useEffect(() => {
    if (!isStreaming || !streamState.content) return;
    if (streamState.displayedContent.length >= streamState.content.length) {
      setStreamState((prev) => ({ ...prev, displayedContent: prev.content }));
      return;
    }
    const timer = setTimeout(() => {
      setStreamState((prev) => {
        const remaining = prev.content.slice(prev.displayedContent.length);
        const wordMatch = remaining.match(/^(\s*\S+)/);
        return {
          ...prev,
          displayedContent: wordMatch
            ? prev.displayedContent + wordMatch[1]
            : prev.content,
        };
      });
    }, 1000 / 12);
    return () => clearTimeout(timer);
  }, [streamState.content, streamState.displayedContent, isStreaming]);

  const handleSend = useCallback(async () => {
    if (!message.trim() || isStreaming) return;

    const userMessage = message.trim();
    setPendingUserMessage(userMessage);
    setMessage('');

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStreamState({
      status: 'connecting',
      content: '',
      displayedContent: '',
      toolCalls: [],
      toolResults: [],
      thoughts: [],
      currentTool: null,
      error: null,
      messageId: null,
      sessionId: null,
      referenceManifest: null,
    });

    try {
      const gen = chatStreamClient.streamThreadMessage(
        parentMessage.id,
        userMessage,
        undefined,
        { signal: controller.signal, timeoutMs: 60_000 },
      );

      for await (const event of gen) {
        if (controller.signal.aborted) break;

        setStreamState((prev) => {
          const next = { ...prev };

          switch (event.type) {
            case 'chunk':
              next.content = prev.content + (event.content || '');
              next.status = 'streaming';
              break;
            case 'tool_call':
              next.toolCalls = [...prev.toolCalls, event];
              next.currentTool = (event.tool as string) || null;
              next.status = 'using_tool';
              break;
            case 'tool_result':
              next.toolResults = [...prev.toolResults, event];
              next.currentTool = null;
              next.status = 'streaming';
              break;
            case 'thought':
              next.thoughts = [...prev.thoughts, event];
              next.status = 'thinking';
              break;
            case 'error':
              next.status = 'error';
              next.error = {
                message: (event.error as string) || 'An error occurred',
                code: (event.error_code as string) || 'internal',
                recoverable: event.recoverable !== false,
              };
              break;
            case 'keepalive':
              break;
            case 'done':
              next.messageId = (event.message_id as number) ?? null;
              next.sessionId = (event.session_id as number) ?? null;
              next.referenceManifest = (event.reference_manifest as ReferenceManifestEntry[]) ?? null;
              next.status = 'done';
              break;
          }

          return next;
        });
      }

      // Stream ended without explicit 'done'
      setStreamState((prev) => {
        if (prev.status !== 'done' && prev.status !== 'error') {
          return { ...prev, status: 'done' };
        }
        return prev;
      });

      setStreamState((prev) => {
        if (prev.status === 'done') {
          queryClient.invalidateQueries({ queryKey: ['thread', parentMessage.id] });
          queryClient.invalidateQueries({ queryKey: ['chat', 'session'] });
          setExpanded(true);
          onCloseInput?.();
        }
        return prev;
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setStreamState({
          status: 'idle',
          content: '',
          displayedContent: '',
          toolCalls: [],
          toolResults: [],
          thoughts: [],
          currentTool: null,
          error: null,
          messageId: null,
          sessionId: null,
          referenceManifest: null,
        });
        return;
      }
      logger.error('Thread stream error:', err);
      setStreamState((prev) => ({
        ...prev,
        status: 'error',
        error: {
          message: (err as Error).message || 'Failed to send message',
          code: 'internal',
          recoverable: true,
        },
      }));
    } finally {
      setPendingUserMessage(null);
    }
  }, [message, isStreaming, parentMessage.id, queryClient, onCloseInput]);

  const handleRetry = useCallback(() => {
    if (!pendingUserMessage) return;
    const msg = pendingUserMessage;
    setPendingUserMessage(null);
    setMessage(msg);
    setTimeout(() => {
      handleSend();
    }, 0);
  }, [pendingUserMessage, handleSend]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamState({
      status: 'idle',
      content: '',
      displayedContent: '',
      toolCalls: [],
      toolResults: [],
      thoughts: [],
      currentTool: null,
      error: null,
      messageId: null,
      sessionId: null,
      referenceManifest: null,
    });
    setPendingUserMessage(null);
  }, []);

  const threadCount = parentMessage.thread_count || threadMessages.length;
  const isExpanded = expanded || showInput;
  const lastMessageId = threadMessages.length
    ? threadMessages[threadMessages.length - 1].id
    : null;

  const EARLIER_COLLAPSE_THRESHOLD = 4;
  const RECENT_VISIBLE_COUNT = 2;
  const hasHiddenEarlier = !showEarlier && threadMessages.length > EARLIER_COLLAPSE_THRESHOLD;
  const visibleThreadMessages = hasHiddenEarlier
    ? threadMessages.slice(-RECENT_VISIBLE_COUNT)
    : threadMessages;
  const hiddenEarlierCount = threadMessages.length - visibleThreadMessages.length;

  return (
    <div className="relative mt-1 ml-3 pl-4 border-l-2 border-(--border)">
      {/* Elbow connector tying the branch back to the parent message */}
      <span className="absolute -left-0.5 top-0 h-3 w-3 border-l-2 border-b-2 border-(--border) rounded-bl-lg pointer-events-none" />

      {/* Thread header — click to expand/collapse */}
      {threadCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mb-1.5 inline-flex items-center gap-1 text-caption text-(--muted-foreground) font-medium hover:text-(--foreground) transition-colors"
        >
          {isExpanded ? <ChevronDownIcon size="xs" /> : <ChevronRightIcon size="xs" />}
          {threadCount} {threadCount === 1 ? 'reply' : 'replies'}
        </button>
      )}

      {/* Thread messages */}
      {isExpanded && (
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Skeleton className="w-8 h-8 rounded-full" />
            </div>
          ) : (
            <>
              {hasHiddenEarlier && (
                <button
                  type="button"
                  onClick={() => setShowEarlier(true)}
                  className="inline-flex items-center gap-1 text-caption text-(--muted-foreground) font-medium hover:text-(--foreground) transition-colors"
                >
                  <ChevronDownIcon size="xs" />
                  Show {hiddenEarlierCount} earlier {hiddenEarlierCount === 1 ? 'reply' : 'replies'}
                </button>
              )}

              {visibleThreadMessages.map(msg => (
                <div key={msg.id} className="flex justify-start">
                  {msg.role === 'user' ? (
                    <div className="group relative w-full px-3 py-2.5 rounded-2xl text-caption bg-(--muted)">
                      <MessageAuthor role="user" />
                      <div className="whitespace-pre-wrap wrap-break-word">{msg.content}</div>
                      {msg.id === lastMessageId && (
                        <span className="absolute top-2.5 right-2.5 text-[0.625rem] text-(--muted-foreground) opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none">
                          {format(new Date(msg.created_at), 'HH:mm')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="group relative w-full px-3.5 py-2.5 rounded-xl text-caption bg-transparent">
                      <MessageAuthor role="assistant" />
                      <MarkdownMessage content={msg.content} referenceManifest={(msg as any).reference_manifest} />
                      {msg.id === lastMessageId && (
                        <span className="absolute top-2.5 right-2.5 text-[0.625rem] text-(--muted-foreground) opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none">
                          {format(new Date(msg.created_at), 'HH:mm')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {pendingUserMessage && (
                <div className="flex justify-start">
                  <div className="relative w-full px-3 py-2.5 rounded-2xl text-caption bg-(--muted)">
                    <MessageAuthor role="user" />
                    <div className="whitespace-pre-wrap wrap-break-word">{pendingUserMessage}</div>
                  </div>
                </div>
              )}

              {isStreaming && (
                <StreamingMessage
                  state={{
                    status: streamState.status as any,
                    content: streamState.content,
                    displayedContent: streamState.displayedContent,
                    toolCalls: streamState.toolCalls.map(e => ({
                      tool: e.tool as string,
                      arguments: (e.arguments as Record<string, unknown>) || {},
                      timestamp: Date.now(),
                    })),
                    toolResults: streamState.toolResults.map(e => ({
                      tool: e.tool as string,
                      result: e.result as string,
                      timestamp: Date.now(),
                    })),
                    thoughts: streamState.thoughts.map(e => ({
                      content: e.content as string,
                      timestamp: Date.now(),
                    })),
                    currentTool: streamState.currentTool,
                    error: streamState.error,
                    messageId: streamState.messageId,
                    sessionId: streamState.sessionId,
                    referenceManifest: streamState.referenceManifest,
                  }}
                  isStreaming={isStreaming}
                  onRetry={handleRetry}
                  onDismiss={handleCancel}
                />
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Thread input */}
      {showInput && (
        <div className="mt-2">
          <ExpandedInput
            size="compact"
            value={message}
            onChange={setMessage}
            onSubmit={handleSend}
            placeholder="Reply in thread..."
            disabled={isStreaming}
            submitIcon={<SendIcon size="xs" />}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
