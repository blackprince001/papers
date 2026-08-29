import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { multiChatApi } from '@/lib/api/multi-chat';
import { chatStreamClient, normalizedStream } from '@/lib/ai/chatStream';
import { CloseIcon, FileTextIcon, GlobeIcon, InsightIcon, SendIcon, SparklesIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { StreamingMessage } from '@/components/ai/StreamingMessage';
import { MessageAuthor } from '@/components/ai/MessageAuthor';
import { ExpandedInput } from '@/components/ExpandedInput';
import { ProviderPicker } from '@/components/ai/ProviderPicker';
import { logger } from '@/lib/logger';
import { useTypewriter } from '@/hooks/use-typewriter';
import {
  INITIAL_AI_STREAM_STATE,
  isAIStreamActive,
  reduceAIStream,
  type AIStreamState,
} from '@/lib/ai/streamState';
import type { AIError } from '@/lib/ai/events';

interface GroupChatPanelProps {
  groupId: number;
  groupName: string;
  onClose: () => void;
}

const GROUP_PROMPTS = [
  {
    label: 'Analyze',
    icon: FileTextIcon,
    prompts: [
      { icon: FileTextIcon, text: 'Summarize All', prompt: 'Provide a concise summary of the key findings and contributions across all papers in this group.' },
      { icon: FileTextIcon, text: 'Compare Methods', prompt: 'Compare and contrast the methodologies used across these papers. What are the key differences and similarities in their approaches?' },
    ],
  },
  {
    label: 'Synthesize',
    icon: InsightIcon,
    prompts: [
      { icon: GlobeIcon, text: 'Research Landscape', prompt: 'Describe how these papers fit into the broader research landscape. What are the connections and conflicts between their findings?' },
      { icon: InsightIcon, text: 'Identify Gaps', prompt: 'Based on these papers, what are the most important open questions or underexplored areas that future research should address?' },
    ],
  },
];

const INCOMPLETE_STREAM_ERROR: AIError = {
  code: 'network',
  message: 'The connection ended before the response was complete. Try again.',
  recoverable: true,
};

export function GroupChatPanel({ groupId, groupName, onClose }: GroupChatPanelProps) {
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<AIStreamState>(INITIAL_AI_STREAM_STATE);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const lastMessageRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const isStreaming = isAIStreamActive(streamState.status);

  const { data: latestSession } = useQuery({
    queryKey: ['multi-chat', 'latest', 'group', groupId],
    queryFn: () => multiChatApi.getGroupHistory(groupId),
    enabled: currentSessionId === null,
  });

  useEffect(() => {
    if (currentSessionId === null && latestSession) setCurrentSessionId(latestSession.id);
  }, [latestSession, currentSessionId]);

  const { data: currentSession, isLoading } = useQuery({
    queryKey: ['multi-chat', 'session', currentSessionId],
    queryFn: () => multiChatApi.getSession(currentSessionId!),
    enabled: currentSessionId !== null,
  });

  const createSessionMutation = useMutation({
    mutationFn: () => multiChatApi.createGroupSession(groupId, 'New Session'),
    onSuccess: (session) => {
      setCurrentSessionId(session.id);
      void queryClient.invalidateQueries({ queryKey: ['multi-chat', 'latest', 'group', groupId] });
    },
  });

  const streamSettled = ['completed', 'failed', 'paused', 'cancelled'].includes(streamState.status);
  const displayedContent = useTypewriter(streamState.content, streamSettled);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages, displayedContent, pendingUserMessage]);

  const handleCancel = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamState(INITIAL_AI_STREAM_STATE);
    setPendingUserMessage(null);
  }, []);

  const handleSendWithText = useCallback(async (userMessage: string) => {
    const generation = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    lastMessageRef.current = userMessage;
    setPendingUserMessage(userMessage);
    setStreamState({ ...INITIAL_AI_STREAM_STATE, status: 'connecting' });

    try {
      let sessionId = currentSessionId;
      if (!sessionId) {
        const session = await createSessionMutation.mutateAsync();
        sessionId = session.id;
        setCurrentSessionId(sessionId);
      }
      if (controller.signal.aborted || generation !== generationRef.current) return;

      setStreamState((previous) => ({ ...previous, sessionId }));
      const stream = normalizedStream(
        chatStreamClient.streamGroupMessage(
          groupId,
          userMessage,
          undefined,
          sessionId,
          {
            signal: controller.signal,
            timeoutMs: 60_000,
            maxRetries: 0,
            providerId: activeProviderId ?? undefined,
          },
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
        await queryClient.invalidateQueries({ queryKey: ['multi-chat', 'session', sessionId] });
        await queryClient.invalidateQueries({ queryKey: ['multi-chat', 'latest', 'group', groupId] });
      }
    } catch (error) {
      if (controller.signal.aborted || (error as Error).name === 'AbortError') {
        if (generation === generationRef.current) setStreamState(INITIAL_AI_STREAM_STATE);
        return;
      }
      logger.error('Group chat stream error:', error);
      if (generation === generationRef.current) {
        setStreamState((previous) => reduceAIStream(previous, {
          type: 'error',
          error: INCOMPLETE_STREAM_ERROR,
        }));
      }
    } finally {
      if (generation === generationRef.current) setPendingUserMessage(null);
    }
  }, [activeProviderId, createSessionMutation, currentSessionId, groupId, queryClient]);

  const handleRetry = useCallback(() => {
    if (!lastMessageRef.current || isStreaming) return;
    void handleSendWithText(lastMessageRef.current);
  }, [handleSendWithText, isStreaming]);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed || isStreaming) return;
    setMessage('');
    void handleSendWithText(trimmed);
  }, [handleSendWithText, isStreaming, message]);

  useEffect(() => () => {
    generationRef.current += 1;
    abortRef.current?.abort();
  }, []);

  const messages = currentSession?.messages || [];
  const showStream = isStreaming || Boolean(streamState.error);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-(--panel-border) bg-(--panel-surface) px-4 py-3">
        <div>
          <h2 className="text-body font-medium">{groupName}</h2>
          <p className="text-caption text-(--muted-foreground)">
            {currentSession?.papers.length || 0} papers
          </p>
        </div>
        <Button variant="icon" size="icon" onClick={onClose} aria-label="Close">
          <CloseIcon size="md" />
        </Button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Skeleton className="size-12 rounded-full" />
          </div>
        ) : messages.length === 0 && !showStream && !pendingUserMessage ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-(--muted-foreground) opacity-50">
            <SparklesIcon size={40} className="mb-3" />
            <p className="text-code">Ask about papers in this group</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="group relative w-full rounded-xl bg-transparent px-3 py-2.5 text-code transition-colors hover:bg-(--muted)/40"
              >
                <MessageAuthor role={msg.role === 'user' ? 'user' : 'assistant'} />
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                ) : (
                  <MarkdownMessage content={msg.content} referenceManifest={msg.reference_manifest} />
                )}
              </div>
            ))}

            {pendingUserMessage && (
              <div className="relative w-full rounded-xl bg-transparent px-3 py-2.5 text-code">
                <MessageAuthor role="user" />
                <p className="whitespace-pre-wrap leading-relaxed">{pendingUserMessage}</p>
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

      <div className="shrink-0 border-t border-(--panel-border) bg-(--panel-surface) p-3">
        <div className="mb-2 flex justify-end">
          <ProviderPicker
            value={activeProviderId}
            onChange={setActiveProviderId}
            className="max-w-56"
          />
        </div>
        <ExpandedInput
          value={message}
          onChange={setMessage}
          onSubmit={handleSend}
          placeholder="Ask about these papers... (Enter to send)"
          submitLabel="Send"
          submitIcon={<SendIcon size="sm" />}
          disabled={isStreaming}
          promptsCollapsible
          promptGroups={GROUP_PROMPTS}
        />
      </div>
    </div>
  );
}
