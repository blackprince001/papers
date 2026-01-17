import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi, type ChatMessage, type ChatSession } from '@/lib/api/chat';
import { MentionAutocomplete, type MentionItem } from './MentionAutocomplete';
import { MarkdownMessage } from './MarkdownMessage';
import { Button } from './Button';
import { format } from 'date-fns';
import { Send, Trash2, FileText, BookOpen, StickyNote, Loader2, AtSign, Maximize2, Minimize2, Sparkles, Plus, MoreVertical, Edit2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { defaultPrompts } from '@/lib/constants/defaultPrompts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError } from '@/lib/utils/toast';
import { useConfirmDialog } from './ConfirmDialog';

interface ChatPanelProps {
  paperId: number;
  onClose?: () => void;
}

export function ChatPanel({ paperId, onClose }: ChatPanelProps) {
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [references, setReferences] = useState<Record<string, any>>({ notes: [], annotations: [], papers: [] });
  const [streamingContent, setStreamingContent] = useState('');
  const [displayContent, setDisplayContent] = useState(''); // Smoothly revealed content
  const [isStreaming, setIsStreaming] = useState(false);
  const [showMentionHint, setShowMentionHint] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPromptsOpen, setIsPromptsOpen] = useState(false);
  const [isSuggestedPromptsExpanded, setIsSuggestedPromptsExpanded] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<{ content: string; references: Record<string, any> } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Track if we're actively streaming to prevent effect from clearing state
  const isStreamingRef = useRef(false);
  // Track the session that initiated streaming to handle new session creation
  const streamingSessionIdRef = useRef<number | null>(null);
  // Interval ref for smooth streaming display
  const displayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Effect to set initial session ID from latest session or first available session
  useEffect(() => {
    if (currentSessionId !== null) return; // Don't override if already set

    if (latestSession)
    {
      // If we have a latest session, use it
      setCurrentSessionId(latestSession.id);
    } else if (!initialLoading && sessions.length > 0)
    {
      // If no latest session but we have sessions, use the first one (most recent)
      setCurrentSessionId(sessions[0].id);
    }
    // If no sessions exist, currentSessionId stays null and we show default prompts
  }, [latestSession, currentSessionId, initialLoading, sessions]);

  // Effect to reset transient state when session changes
  // BUT only if we're not actively streaming (to handle new session creation during first message)
  useEffect(() => {
    // Don't clear state if:
    // 1. We're actively streaming
    // 2. This session change is due to a new session being created during streaming
    if (isStreamingRef.current)
    {
      // Update the streaming session ref to the new session
      streamingSessionIdRef.current = currentSessionId;
      return;
    }

    // Reset streaming and pending states when session changes
    setPendingUserMessage(null);
    setStreamingContent('');
    setDisplayContent('');
    setIsStreaming(false);
  }, [currentSessionId]);

  // Fetch specific session history
  const { data: currentSession, isLoading: sessionLoading } = useQuery({
    queryKey: ['chat', 'session', currentSessionId],
    queryFn: () => chatApi.getSession(currentSessionId!),
    enabled: currentSessionId !== null,
    retry: false,
  });

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

      // If we deleted the current session, switch to another one or clear
      if (currentSessionId === deletedSessionId)
      {
        // Get updated sessions list
        queryClient.invalidateQueries({ queryKey: ['chat', 'sessions', paperId] });
        // Reset to get latest session
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

  // Auto-scroll to bottom when new messages arrive or streaming content updates
  const messages = currentSession?.messages || latestSession?.messages || [];
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, displayContent, pendingUserMessage]);

  // Smooth streaming effect - gradually reveal content
  useEffect(() => {
    if (streamingContent.length > displayContent.length)
    {
      // Clear any existing interval
      if (displayIntervalRef.current)
      {
        clearInterval(displayIntervalRef.current);
      }

      // Reveal characters gradually (50ms per character for fancy typing effect)
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
          // Reveal 1 character at a time for premium typing appearance
          return streamingContent.slice(0, prev.length + 1);
        });
      }, 100);
    }

    return () => {
      if (displayIntervalRef.current)
      {
        clearInterval(displayIntervalRef.current);
        displayIntervalRef.current = null;
      }
    };
  }, [streamingContent]);

  // Fullscreen handling
  const handleFullscreenToggle = useCallback(async () => {
    if (!containerRef.current) return;

    try
    {
      if (!isFullscreen)
      {
        await containerRef.current.requestFullscreen();
      } else
      {
        await document.exitFullscreen();
      }
    } catch (err)
    {
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleSend = async (e?: React.FormEvent, content?: string) => {
    e?.preventDefault();
    const messageToSend = content || message;

    if (messageToSend.trim() && !isStreaming)
    {
      const userMessage = messageToSend;
      const userReferences = { ...references };

      // Show user message immediately (optimistic update)
      setPendingUserMessage({ content: userMessage, references: userReferences });

      // Clear input immediately
      setMessage('');
      setReferences({ notes: [], annotations: [], papers: [] });
      setIsStreaming(true);
      isStreamingRef.current = true;
      streamingSessionIdRef.current = currentSessionId;
      setStreamingContent('');

      // accumulators
      let accumulatedResponse = '';

      try
      {
        // Start streaming
        for await (const chunk of chatApi.streamMessage(paperId, userMessage, userReferences, currentSessionId || undefined))
        {
          if (chunk.type === 'chunk' && chunk.content)
          {
            accumulatedResponse += chunk.content;
            setStreamingContent((prev) => prev + chunk.content);
          } else if (chunk.type === 'done')
          {
            // Stream complete
            const finalSessionId = chunk.session_id || currentSessionId;

            // Manually update cache to ensure messages persist immediately
            if (finalSessionId)
            {
              queryClient.setQueryData<ChatSession>(['chat', 'session', finalSessionId], (oldSession) => {
                if (!oldSession) return oldSession;

                // Create new messages with temporary IDs
                // These will be replaced by real IDs on next refetch
                const newUserMsg: ChatMessage = {
                  id: Date.now(),
                  session_id: finalSessionId,
                  role: 'user',
                  content: userMessage,
                  references: userReferences,
                  created_at: new Date().toISOString()
                };

                const newAssistantMsg: ChatMessage = {
                  id: Date.now() + 1,
                  session_id: finalSessionId,
                  role: 'assistant',
                  content: accumulatedResponse,
                  created_at: new Date().toISOString()
                };

                return {
                  ...oldSession,
                  messages: [...(oldSession.messages || []), newUserMsg, newAssistantMsg]
                };
              });
            }

            // Reset streaming refs first
            isStreamingRef.current = false;
            streamingSessionIdRef.current = null;

            // Reset UI states
            setStreamingContent('');
            setDisplayContent('');
            setIsStreaming(false);
            setPendingUserMessage(null);

            if (chunk.session_id && currentSessionId === null)
            {
              setCurrentSessionId(chunk.session_id);
            }

            // Background refresh to get real IDs and ensure consistency
            // Use setTimeout to defer invalidation, preventing UI flicker
            // The cache already has the messages, so this is just to sync with server
            setTimeout(() => {
              if (finalSessionId)
              {
                queryClient.invalidateQueries({ queryKey: ['chat', 'session', finalSessionId] });
              }
              queryClient.invalidateQueries({ queryKey: ['chat', 'sessions', paperId] });
              queryClient.invalidateQueries({ queryKey: ['chat', 'latest', paperId] });
            }, 100);
          } else if (chunk.type === 'error')
          {
            // Reset streaming refs
            isStreamingRef.current = false;
            streamingSessionIdRef.current = null;

            // Handle error
            setStreamingContent('');
            setDisplayContent('');
            setIsStreaming(false);
            setPendingUserMessage(null);
            toastError(`Error: ${chunk.error || 'Failed to get response'}`);
            queryClient.invalidateQueries({ queryKey: ['chat', 'session', currentSessionId] });
          }
        }
      } catch (error)
      {
        // Reset streaming refs
        isStreamingRef.current = false;
        streamingSessionIdRef.current = null;

        setStreamingContent('');
        setDisplayContent('');
        setIsStreaming(false);
        setPendingUserMessage(null);
        toastError(`Error: ${error instanceof Error ? error.message : 'Failed to send message'}`);
        queryClient.invalidateQueries({ queryKey: ['chat', 'session', currentSessionId] });
      }
    }
  };


  const handleMentionSelect = (mention: MentionItem) => {
    // Add mention to references
    const refKey = `${mention.type}s` as 'notes' | 'annotations' | 'papers';
    setReferences((prev) => ({
      ...prev,
      [refKey]: [...(prev[refKey] || []), { id: mention.id, type: mention.type }],
    }));
  };

  const getReferenceIcon = (type: string) => {
    switch (type)
    {
      case 'note':
        return <StickyNote className="w-3 h-3" />;
      case 'annotation':
        return <FileText className="w-3 h-3" />;
      case 'paper':
        return <BookOpen className="w-3 h-3" />;
      default:
        return null;
    }
  };

  // Helper function to parse mentions from text
  const parseMentions = (content: string): (string | { type: string; id: number })[] => {
    const mentionRegex = /@(note|annotation|paper)\{(\d+)\}/g;
    const parts: (string | { type: string; id: number })[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null)
    {
      if (match.index > lastIndex)
      {
        parts.push(content.substring(lastIndex, match.index));
      }
      parts.push({ type: match[1], id: parseInt(match[2]) });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length)
    {
      parts.push(content.substring(lastIndex));
    }

    if (parts.length === 0)
    {
      parts.push(content);
    }

    return parts;
  };

  const renderMessageContent = (msg: ChatMessage) => {
    // For user messages, parse mentions
    if (msg.role === 'user')
    {
      const parts = parseMentions(msg.content);

      return (
        <div className="whitespace-pre-wrap break-words">
          {parts.map((part, index) => {
            if (typeof part === 'string')
            {
              return <span key={index}>{part}</span>;
            } else
            {
              return (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 bg-blue-5 text-green-34 rounded text-xs font-medium"
                >
                  {getReferenceIcon(part.type)}
                  {part.type} {part.id}
                </span>
              );
            }
          })}
        </div>
      );
    }

    // For assistant messages, render markdown
    return <MarkdownMessage content={msg.content} />;
  };

  // Note: We no longer distinguish between sidebar and standalone contexts - they should behave identically
  // The only difference is when ChatPanel itself enters fullscreen mode (via its own fullscreen button)

  const handleRename = (id: number, currentName: string) => {
    const newName = window.prompt('Rename session:', currentName);
    if (newName !== null && newName !== currentName && newName.trim() !== "")
    {
      renameSessionMutation.mutate({ id, name: newName });
    }
  };

  const handleClearMessages = useCallback(() => {
    if (currentSessionId)
    {
      confirm(
        'Clear Messages',
        'Clear all messages from this session? This action cannot be undone.',
        () => {
          clearMessagesMutation.mutate(currentSessionId);
        },
        { variant: 'default', confirmLabel: 'Clear' }
      );
    }
  }, [currentSessionId, confirm, clearMessagesMutation]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col h-full",
        // Only apply fixed positioning if ChatPanel itself is in fullscreen (not when used in sidebar/overlay)
        isFullscreen && !onClose && "fixed inset-0 z-50 bg-grayscale-8"
      )}
    >
      {/* Single centered container - always centers content regardless of context */}
      <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-2 border-b border-green-6 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Select
              value={currentSessionId?.toString() || ""}
              onValueChange={(val: string | null) => {
                if (val && val.trim() !== "")
                {
                  const id = parseInt(val);
                  if (!isNaN(id) && id !== currentSessionId)
                  {
                    // Reset transient state before switching
                    setPendingUserMessage(null);
                    setStreamingContent('');
                    setDisplayContent('');
                    setIsStreaming(false);
                    // Invalidate queries first to ensure fresh data
                    queryClient.invalidateQueries({ queryKey: ['chat', 'session', id] });
                    queryClient.invalidateQueries({ queryKey: ['chat', 'sessions', paperId] });
                    // Then update session ID
                    setCurrentSessionId(id);
                  }
                }
              }}
              disabled={sessionsLoading || isStreaming}
            >
              <SelectTrigger className="h-8 text-xs w-[160px] border-none shadow-none focus:ring-0 px-2 hover:bg-green-4">
                <SelectValue placeholder={sessionsLoading ? "Loading..." : sessions.length === 0 ? "No sessions" : "Select session"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-green-28">No sessions yet</div>
                ) : (
                  sessions.map((s) => (
                    <SelectItem
                      key={s.id}
                      value={s.id.toString()}
                      className="text-xs group"
                    >
                      <div className="flex items-center justify-between w-full pr-1">
                        <span className="flex-1">{s.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            confirm(
                              'Delete Session',
                              `Delete "${s.name}"? This action cannot be undone.`,
                              () => {
                                deleteSessionMutation.mutate(s.id);
                              },
                              { variant: 'destructive', confirmLabel: 'Delete' }
                            );
                          }}
                          disabled={deleteSessionMutation.isPending || isStreaming}
                          title="Delete session"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const sessionName = `Session ${sessions.length + 1}`;
                  createSessionMutation.mutate(sessionName);
                }}
                disabled={createSessionMutation.isPending || sessionsLoading}
                className="h-7 w-7 p-0 rounded-md"
                title="New Session"
              >
                {createSessionMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
              </Button>

              {currentSession && currentSession.messages && currentSession.messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearMessages}
                  disabled={clearMessagesMutation.isPending || isStreaming}
                  className="h-7 w-7 p-0 rounded-md"
                  title="Clear Messages"
                >
                  {clearMessagesMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                </Button>
              )}

              {currentSessionId && sessions.find(s => s.id === currentSessionId) && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-md" disabled={sessionsLoading}>
                      <MoreVertical className="w-3.5 h-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-1" align="start">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs h-8 px-2"
                      onClick={() => {
                        if (currentSessionId)
                        {
                          const session = sessions.find(s => s.id === currentSessionId);
                          handleRename(currentSessionId, session?.name || 'Session');
                        }
                      }}
                      disabled={renameSessionMutation.isPending}
                    >
                      <Edit2 className="w-3 h-3 mr-2" />
                      {renameSessionMutation.isPending ? 'Renaming...' : 'Rename'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs h-8 px-2"
                      onClick={handleClearMessages}
                      disabled={clearMessagesMutation.isPending || !currentSession || (currentSession?.messages?.length || 0) === 0}
                    >
                      <X className="w-3 h-3 mr-2" />
                      {clearMessagesMutation.isPending ? 'Clearing...' : 'Clear Messages'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        if (currentSessionId)
                        {
                          confirm(
                            'Delete Session',
                            'Delete this session? This action cannot be undone.',
                            () => {
                              deleteSessionMutation.mutate(currentSessionId);
                            },
                            { variant: 'destructive', confirmLabel: 'Delete' }
                          );
                        }
                      }}
                      disabled={deleteSessionMutation.isPending}
                    >
                      <Trash2 className="w-3 h-3 mr-2" />
                      {deleteSessionMutation.isPending ? 'Deleting...' : 'Delete'}
                    </Button>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {onClose ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 px-2"
                title="Close Chat"
              >
                <Minimize2 className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleFullscreenToggle}
                className="h-8 px-2"
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="w-full p-4 space-y-4">
            {(initialLoading || sessionLoading || sessionsLoading) ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-green-24" />
              </div>
            ) : (messages.length === 0 && !pendingUserMessage && (currentSessionId === null || sessions.length === 0)) ? (
              <div className="flex flex-col h-full">
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 space-y-6">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-green-38">Start a conversation</h3>
                    <p className="text-sm text-green-28 max-w-xs mx-auto">
                      Ask a question or select a prompt below to get started.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                    {defaultPrompts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          handleSend({ preventDefault: () => { } } as React.FormEvent, p.content);
                        }}
                        className="flex flex-col items-start p-4 bg-grayscale-8 border border-green-6 rounded-xl hover:border-blue-19 hover:bg-blue-5/30 transition-all text-left group"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="p-2 bg-green-4 rounded-lg group-hover:bg-grayscale-8 text-green-28 group-hover:text-blue-43 transition-colors">
                            <p.icon className="w-4 h-4" />
                          </div>
                          <span className="font-medium text-sm text-green-38">{p.label}</span>
                        </div>
                        <p className="text-xs text-green-28 line-clamp-2">
                          {p.description}
                        </p>
                      </button>
                    ))}
                  </div>

                  <div className="text-xs text-green-24">
                    Use @ to reference notes, annotations, or papers
                  </div>
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, index) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex animate-in fade-in slide-in-from-bottom-2 duration-300",
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                    style={{
                      animationDelay: `${Math.min(index * 50, 500)}ms`,
                    }}
                  >
                    <div
                      className={cn(
                        "rounded-lg px-4 py-3 transition-all text-sm max-w-[90%] sm:max-w-[85%]",
                        msg.role === 'user'
                          ? 'bg-blue-5 text-green-34'
                          : 'bg-green-4 text-green-38'
                      )}
                    >
                      {renderMessageContent(msg)}
                      <div
                        className={cn(
                          "text-xs mt-2",
                          msg.role === 'user' ? 'text-gray-600' : 'text-gray-500'
                        )}
                      >
                        {format(new Date(msg.created_at), 'HH:mm')}
                      </div>
                    </div>
                  </div>
                ))}
                {/* Show pending user message immediately */}
                {pendingUserMessage && (
                  <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="rounded-lg px-4 py-3 bg-corca-blue-light text-gray-700 text-sm max-w-[90%] sm:max-w-[85%]">
                      <div className="whitespace-pre-wrap break-words">
                        {parseMentions(pendingUserMessage.content).map((part, index) => {
                          if (typeof part === 'string')
                          {
                            return <span key={index}>{part}</span>;
                          } else
                          {
                            return (
                              <span
                                key={index}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 bg-white/50 text-gray-700 rounded text-xs"
                              >
                                {getReferenceIcon(part.type)}
                                {part.type} {part.id}
                              </span>
                            );
                          }
                        })}
                      </div>
                      <div className="text-xs mt-2 text-gray-600">
                        {format(new Date(), 'HH:mm')}
                      </div>
                    </div>
                  </div>
                )}
                {isStreaming && (
                  <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="rounded-lg px-4 py-3 bg-gray-100 text-gray-900 text-sm max-w-[90%] sm:max-w-[85%]">
                      {displayContent ? (
                        <MarkdownMessage content={displayContent} />
                      ) : (
                        <div className="space-y-2.5 w-72">
                          {/* Word-like skeleton - mimics actual text layout */}
                          <div className="flex flex-wrap gap-1.5">
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-12" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-16" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-8" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-20" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-14" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-10" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-24" />
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-20" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-8" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-16" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-12" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-18" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-10" />
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-14" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-20" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-8" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-12" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-16" />
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-10" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-16" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-12" />
                          </div>
                        </div>
                      )}
                      {displayContent && (
                        <div className="text-xs mt-2 text-gray-500 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Typing...</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Show collapsible prompts section when messages exist and not streaming */}
                {currentSession && messages.length > 0 && !isStreaming && !pendingUserMessage && (
                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => setIsSuggestedPromptsExpanded(!isSuggestedPromptsExpanded)}
                      className="w-full flex items-center justify-between py-2 px-1 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-gray-400" />
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Suggested Prompts</h4>
                      </div>
                      {isSuggestedPromptsExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    {isSuggestedPromptsExpanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                        {defaultPrompts.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              handleSend(undefined, p.content);
                            }}
                            className="flex flex-col items-start p-3 bg-gray-50 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left group"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <div className="p-1.5 bg-white rounded-md group-hover:bg-blue-100 text-gray-600 group-hover:text-blue-600 transition-colors">
                                <p.icon className="w-3.5 h-3.5" />
                              </div>
                              <span className="font-medium text-xs text-gray-900">{p.label}</span>
                            </div>
                            <p className="text-xs text-gray-600 line-clamp-2">
                              {p.description}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 relative flex-shrink-0 p-3">
          <div className="w-full">
            <div className="bg-white border border-gray-200 rounded-2xl">
              <div className="px-3 pt-3 pb-2 relative">
                <form onSubmit={handleSend}>
                  <MentionAutocomplete
                    paperId={paperId}
                    value={message}
                    onChange={(val) => {
                      setMessage(val);
                      // Show hint if @ is typed but not completed
                      const hasIncompleteMention = val.includes('@') && !val.match(/@(note|annotation|paper)\{\d+\}/);
                      setShowMentionHint(hasIncompleteMention);
                    }}
                    onMentionSelect={(mention) => {
                      handleMentionSelect(mention);
                      setShowMentionHint(false);
                    }}
                    onSend={() => {
                      if (message.trim() && !isStreaming)
                      {
                        const syntheticEvent = { preventDefault: () => { } } as React.FormEvent;
                        handleSend(syntheticEvent);
                      }
                    }}
                    placeholder="Ask anything... Use @ to reference notes, annotations, or papers (Ctrl+Enter to send)"
                    className="text-sm"
                  />
                </form>
              </div>

              <div className="mb-2 px-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setShowMentionHint(!showMentionHint)}
                    className="h-7 w-7 p-0 rounded-full border border-gray-200 hover:bg-gray-100"
                    title="Mention references"
                  >
                    <AtSign className="size-3" />
                  </Button>

                  <Popover open={isPromptsOpen} onOpenChange={setIsPromptsOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        className="h-7 w-7 p-0 rounded-full border border-gray-300 hover:bg-blue-50 hover:border-blue-400 ml-1 transition-colors"
                        title="AI Prompts"
                      >
                        <Sparkles className="size-3.5 text-blue-600" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start" side="top">
                      <div className="p-2 border-b border-gray-200">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-semibold text-gray-900">Suggested Prompts</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Choose a prompt to start or continue your conversation</p>
                      </div>
                      <div className="grid gap-1 p-1 max-h-80 overflow-y-auto">
                        {defaultPrompts.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              handleSend(undefined, p.content);
                              setIsPromptsOpen(false);
                            }}
                            className="w-full text-left flex items-start gap-3 p-2 rounded-md hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
                          >
                            <div className="mt-0.5 text-blue-600 flex-shrink-0">
                              <p.icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900">{p.label}</div>
                              <div className="text-xs text-gray-500 line-clamp-2 text-wrap">
                                {p.description}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {Object.values(references).flat().length > 0 && (
                    <div className="text-xs text-gray-500 px-2">
                      {Object.values(references).flat().length} reference(s)
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={!message.trim() || isStreaming}
                  onClick={handleSend}
                  className={cn(
                    "size-7 p-0 rounded-full disabled:opacity-50 disabled:cursor-not-allowed",
                    isStreaming
                      ? "bg-gray-400"
                      : "bg-gray-900 hover:bg-gray-800"
                  )}
                >
                  {isStreaming ? (
                    <Loader2 className="size-3 text-white animate-spin" />
                  ) : (
                    <Send className="size-3 text-white fill-white" />
                  )}
                </Button>
              </div>

              {showMentionHint && (
                <div className="mt-2 text-xs text-gray-500 px-2 animate-in fade-in duration-200">
                  💡 Type @ to mention notes, annotations, or other papers
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}

