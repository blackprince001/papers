import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi, type ChatMessage } from '@/lib/api/chat';
import { chatStreamClient, normalizedStream } from '@/lib/ai/chatStream';
import { MarkdownMessage } from './MarkdownMessage';
import { MessageAuthor } from '@/components/ai/MessageAuthor';
import { StreamingMessage } from '@/components/ai/StreamingMessage';
import { ExpandedInput } from './ExpandedInput';
import { format } from 'date-fns';
import { ChevronDownIcon, ChevronRightIcon, SendIcon } from '@/components/icons';
import { Skeleton } from './ui/Skeleton';
import { logger } from '@/lib/logger';
import { useTypewriter } from '@/hooks/use-typewriter';
import {
  INITIAL_AI_STREAM_STATE,
  isAIStreamActive,
  reduceAIStream,
  type AIStreamState,
} from '@/lib/ai/streamState';
import type { AIError } from '@/lib/ai/events';

interface MessageThreadProps {
  parentMessage: ChatMessage;
  showInput?: boolean;
  onCloseInput?: () => void;
}

const INCOMPLETE_STREAM_ERROR: AIError = {
  code: 'network',
  message: 'The connection ended before the response was complete. Try again.',
  recoverable: true,
};

export function MessageThread({ parentMessage, showInput = false, onCloseInput }: MessageThreadProps) {
  const [message, setMessage] = useState('');
  const [streamState, setStreamState] = useState<AIStreamState>(INITIAL_AI_STREAM_STATE);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const lastMessageRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const isStreaming = isAIStreamActive(streamState.status);
  const streamSettled = ['completed', 'failed', 'paused', 'cancelled'].includes(streamState.status);
  const displayedContent = useTypewriter(streamState.content, streamSettled);

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
  }, [threadMessages, streamState.content, pendingUserMessage]);

  const runStream = useCallback(
    async (userMessage: string) => {
      const generation = ++generationRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      lastMessageRef.current = userMessage;
      setPendingUserMessage(userMessage);
      setStreamState({ ...INITIAL_AI_STREAM_STATE, status: 'connecting' });

      try {
        const stream = normalizedStream(
          chatStreamClient.streamThreadMessage(
            parentMessage.id,
            userMessage,
            undefined,
            { signal: controller.signal, timeoutMs: 60_000, maxRetries: 0 },
          ),
        );
        let sawTerminalEvent = false;
        let completed = false;

        for await (const event of stream) {
          if (controller.signal.aborted || generation !== generationRef.current) return;
          setStreamState((previous) => reduceAIStream(previous, event));
          if (event.type === 'complete') {
            sawTerminalEvent = true;
            completed = true;
          } else if (
            event.type === 'error' ||
            event.type === 'paused' ||
            event.type === 'cancelled'
          ) {
            sawTerminalEvent = true;
          }
        }

        if (
          !sawTerminalEvent &&
          !controller.signal.aborted &&
          generation === generationRef.current
        ) {
          setStreamState((previous) => reduceAIStream(previous, {
            type: 'error',
            error: INCOMPLETE_STREAM_ERROR,
          }));
        } else if (completed && generation === generationRef.current) {
          await queryClient.invalidateQueries({ queryKey: ['thread', parentMessage.id] });
          await queryClient.invalidateQueries({ queryKey: ['chat', 'session'] });
          setExpanded(true);
          onCloseInput?.();
        }
      } catch (error) {
        if (controller.signal.aborted || (error as Error).name === 'AbortError') {
          if (generation === generationRef.current) setStreamState(INITIAL_AI_STREAM_STATE);
          return;
        }
        logger.error('Thread stream error:', error);
        if (generation === generationRef.current) {
          setStreamState((previous) => reduceAIStream(previous, {
            type: 'error',
            error: INCOMPLETE_STREAM_ERROR,
          }));
        }
      } finally {
        if (generation === generationRef.current) setPendingUserMessage(null);
      }
    },
    [onCloseInput, parentMessage.id, queryClient],
  );

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed || isStreaming) return;
    setMessage('');
    void runStream(trimmed);
  }, [isStreaming, message, runStream]);

  const handleRetry = useCallback(() => {
    if (!lastMessageRef.current || isStreaming) return;
    void runStream(lastMessageRef.current);
  }, [isStreaming, runStream]);

  const handleCancel = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamState(INITIAL_AI_STREAM_STATE);
    setPendingUserMessage(null);
  }, []);

  useEffect(() => () => {
    generationRef.current += 1;
    abortRef.current?.abort();
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
  const showStream = isStreaming || Boolean(streamState.error);

  return (
    <div className="relative mt-1 ml-3 border-l-2 border-(--border) pl-4">
      <span className="pointer-events-none absolute -left-0.5 top-0 h-3 w-3 rounded-bl-lg border-b-2 border-l-2 border-(--border)" />

      {threadCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mb-1.5 inline-flex items-center gap-1 text-caption font-medium text-(--muted-foreground) transition-colors hover:text-(--foreground)"
        >
          {isExpanded ? <ChevronDownIcon size="xs" /> : <ChevronRightIcon size="xs" />}
          {threadCount} {threadCount === 1 ? 'reply' : 'replies'}
        </button>
      )}

      {isExpanded && (
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Skeleton className="size-8 rounded-full" />
            </div>
          ) : (
            <>
              {hasHiddenEarlier && (
                <button
                  type="button"
                  onClick={() => setShowEarlier(true)}
                  className="inline-flex items-center gap-1 text-caption font-medium text-(--muted-foreground) transition-colors hover:text-(--foreground)"
                >
                  <ChevronDownIcon size="xs" />
                  Show {hiddenEarlierCount} earlier {hiddenEarlierCount === 1 ? 'reply' : 'replies'}
                </button>
              )}

              {visibleThreadMessages.map((msg) => (
                <div key={msg.id} className="flex justify-start">
                  {msg.role === 'user' ? (
                    <div className="group relative w-full rounded-2xl bg-(--muted) px-3 py-2.5 text-caption">
                      <MessageAuthor role="user" />
                      <div className="whitespace-pre-wrap wrap-break-word">{msg.content}</div>
                      {msg.id === lastMessageId && (
                        <span className="pointer-events-none absolute right-2.5 top-2.5 text-[0.625rem] text-(--muted-foreground) opacity-0 transition-opacity group-hover:opacity-60">
                          {format(new Date(msg.created_at), 'HH:mm')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="group relative w-full rounded-xl bg-transparent px-3.5 py-2.5 text-caption">
                      <MessageAuthor role="assistant" />
                      <MarkdownMessage content={msg.content} referenceManifest={msg.reference_manifest} />
                      {msg.id === lastMessageId && (
                        <span className="pointer-events-none absolute right-2.5 top-2.5 text-[0.625rem] text-(--muted-foreground) opacity-0 transition-opacity group-hover:opacity-60">
                          {format(new Date(msg.created_at), 'HH:mm')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {pendingUserMessage && (
                <div className="flex justify-start">
                  <div className="relative w-full rounded-2xl bg-(--muted) px-3 py-2.5 text-caption">
                    <MessageAuthor role="user" />
                    <div className="whitespace-pre-wrap wrap-break-word">{pendingUserMessage}</div>
                  </div>
                </div>
              )}

              {showStream && (
                <StreamingMessage
                  status={streamState.status}
                  content={streamState.content}
                  displayedContent={displayedContent}
                  activities={streamState.activities}
                  sources={streamState.sources}
                  warning={streamState.warning}
                  retry={streamState.retry}
                  error={streamState.error}
                  referenceManifest={streamState.referenceManifest}
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
