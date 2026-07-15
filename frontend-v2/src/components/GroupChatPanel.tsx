import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { multiChatApi } from '@/lib/api/multi-chat';
import { chatStreamClient } from '@/lib/ai/chatStream';
import type { StreamEvent } from '@/lib/ai/chatStream';
import { CloseIcon, FileTextIcon, GlobeIcon, InsightIcon, SendIcon, SparklesIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { StreamingMessage } from '@/components/ai/StreamingMessage';
import { MessageAuthor } from '@/components/ai/MessageAuthor';
import { ExpandedInput } from '@/components/ExpandedInput';
import { ProviderPicker } from '@/components/ai/ProviderPicker';
import type { ReferenceManifestEntry } from '@/lib/api/references';
import { logger } from '@/lib/logger';
import { useTypewriter } from '@/hooks/use-typewriter';

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

export function GroupChatPanel({ groupId, groupName, onClose }: GroupChatPanelProps) {
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();
  const isStreaming = streamState.status !== 'idle' && streamState.status !== 'done' && streamState.status !== 'error';

  const { data: latestSession } = useQuery({
    queryKey: ['multi-chat', 'latest', 'group', groupId],
    queryFn: () => multiChatApi.getGroupHistory(groupId),
    enabled: currentSessionId === null,
  });

  useEffect(() => {
    if (currentSessionId === null && latestSession) {
      setCurrentSessionId(latestSession.id);
    }
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
      queryClient.invalidateQueries({ queryKey: ['multi-chat', 'latest', 'group', groupId] });
    },
  });

  // Smooth typewriter reveal of the streamed content (flushes on settle).
  const streamSettled = streamState.status === 'done' || streamState.status === 'error';
  const displayedContent = useTypewriter(streamState.content, streamSettled);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages, displayedContent, pendingUserMessage]);

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

  const handleRetry = useCallback(() => {
    if (!pendingUserMessage) return;
    const msg = pendingUserMessage;
    setPendingUserMessage(null);
    // Re-trigger send with the saved message
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
    // Kick off send in next tick
    setTimeout(() => handleSendWithText(msg), 0);
  }, [pendingUserMessage]);

  const handleSendWithText = useCallback(async (userMessage: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPendingUserMessage(userMessage);
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
      let sessionId = currentSessionId;
      if (!sessionId) {
        const session = await createSessionMutation.mutateAsync();
        sessionId = session.id;
      }

      const gen = chatStreamClient.streamGroupMessage(
        groupId,
        userMessage,
        undefined,
        sessionId,
        {
          signal: controller.signal,
          timeoutMs: 60_000,
          maxRetries: 2,
          providerId: activeProviderId ?? undefined,
        },
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

      // Invalidate cache to refresh persisted messages
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ['multi-chat', 'session', sessionId] });
      }
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
      logger.error('Group chat stream error:', err);
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
  }, [currentSessionId, groupId, queryClient, createSessionMutation, activeProviderId]);

  const handleSend = useCallback(() => {
    if (!message.trim() || isStreaming) return;
    const msg = message.trim();
    setMessage('');
    handleSendWithText(msg);
  }, [message, isStreaming, handleSendWithText]);

  const messages = currentSession?.messages || [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--panel-border) bg-(--panel-surface)">
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-0.5">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Skeleton className="w-12 h-12 rounded-full" />
          </div>
        ) : messages.length === 0 && !isStreaming && !pendingUserMessage ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-(--muted-foreground) opacity-50">
            <SparklesIcon size={32} className="mb-3" />
            <p className="text-code">Ask about papers in this group</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="group relative w-full px-3 py-2.5 text-code rounded-xl bg-transparent transition-colors hover:bg-(--muted)/40"
              >
                <MessageAuthor role={msg.role === 'user' ? 'user' : 'assistant'} />
                {msg.role === 'user' ? (
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <MarkdownMessage content={msg.content} referenceManifest={(msg as any).reference_manifest} />
                )}
              </div>
            ))}

            {/* Pending user message */}
            {pendingUserMessage && (
              <div className="relative w-full px-3 py-2.5 rounded-xl text-code bg-transparent">
                <MessageAuthor role="user" />
                <p className="leading-relaxed whitespace-pre-wrap">{pendingUserMessage}</p>
              </div>
            )}

            {/* Streaming response */}
            {isStreaming && (
              <StreamingMessage
                state={{
                  status: streamState.status as any,
                  content: streamState.content,
                  displayedContent: displayedContent,
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

            {/* Error state without active stream */}
            {!isStreaming && streamState.error && (
              <div className="mt-2">
                {/* ErrorBanner is inside StreamingMessage on retry; just show inline error for now */}
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-(--panel-border) p-3 shrink-0 bg-(--panel-surface)">
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
