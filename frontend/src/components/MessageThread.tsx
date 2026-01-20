import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi, type ChatMessage } from '@/lib/api/chat';
import { MarkdownMessage } from './MarkdownMessage';
import { Button } from './Button';
import { format } from 'date-fns';
import { Send, Loader2, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toastError } from '@/lib/utils/toast';

interface MessageThreadProps {
  parentMessage: ChatMessage;
  isExpanded: boolean;
  onToggle: () => void;
}

export function MessageThread({ parentMessage, isExpanded, onToggle }: MessageThreadProps) {
  const [message, setMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [displayContent, setDisplayContent] = useState('');
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const displayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();

  // Fetch thread messages
  const { data: threadMessages = [], isLoading } = useQuery({
    queryKey: ['thread', parentMessage.id],
    queryFn: () => chatApi.getThreadMessages(parentMessage.id),
    enabled: isExpanded,
    refetchOnWindowFocus: false,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isExpanded)
    {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [threadMessages, displayContent, pendingUserMessage, isExpanded]);

  // Smooth streaming effect
  useEffect(() => {
    if (streamingContent.length > displayContent.length)
    {
      if (displayIntervalRef.current)
      {
        clearInterval(displayIntervalRef.current);
      }

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
          return streamingContent.slice(0, prev.length + 1);
        });
      }, 50);
    }

    return () => {
      if (displayIntervalRef.current)
      {
        clearInterval(displayIntervalRef.current);
        displayIntervalRef.current = null;
      }
    };
  }, [streamingContent]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (message.trim() && !isStreaming)
    {
      const userMessage = message;
      setPendingUserMessage(userMessage);
      setMessage('');
      setIsStreaming(true);
      setStreamingContent('');
      setDisplayContent('');

      let accumulatedResponse = '';

      try
      {
        for await (const chunk of chatApi.streamThreadMessage(parentMessage.id, userMessage))
        {
          if (chunk.type === 'chunk' && chunk.content)
          {
            accumulatedResponse += chunk.content;
            setStreamingContent(prev => prev + chunk.content);
          } else if (chunk.type === 'done')
          {
            // Invalidate thread query to refresh messages
            queryClient.invalidateQueries({ queryKey: ['thread', parentMessage.id] });
            // Also invalidate parent message to update thread_count
            queryClient.invalidateQueries({ queryKey: ['chat', 'session'] });

            setStreamingContent('');
            setDisplayContent('');
            setIsStreaming(false);
            setPendingUserMessage(null);
          } else if (chunk.type === 'error')
          {
            setStreamingContent('');
            setDisplayContent('');
            setIsStreaming(false);
            setPendingUserMessage(null);
            toastError(`Error: ${chunk.error || 'Failed to get response'}`);
          }
        }
      } catch (error)
      {
        setStreamingContent('');
        setDisplayContent('');
        setIsStreaming(false);
        setPendingUserMessage(null);
        toastError(`Error: ${error instanceof Error ? error.message : 'Failed to send message'}`);
      }
    }
  };

  const threadCount = parentMessage.thread_count || threadMessages.length;

  return (
    <div className="mt-2">
      {/* Thread toggle button */}
      <button
        onClick={onToggle}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors",
          "text-blue-43 hover:bg-blue-5",
          isExpanded && "bg-blue-5"
        )}
      >
        <MessageSquare className="w-3.5 h-3.5" />
        {threadCount > 0 ? (
          <>
            <span>{threadCount} {threadCount === 1 ? 'reply' : 'replies'}</span>
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </>
        ) : (
          <>
            <span>Reply</span>
            {isExpanded && <ChevronUp className="w-3 h-3" />}
          </>
        )}
      </button>

      {/* Expanded thread panel */}
      {isExpanded && (
        <div className="mt-2 ml-4 pl-3 pr-6 border-l-2 border-blue-19">
          {/* Thread messages */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-green-24" />
              </div>
            ) : (
              <>
                {threadMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-lg px-3 py-2 text-xs max-w-[85%]",
                        msg.role === 'user'
                          ? 'bg-blue-5 text-green-34'
                          : 'bg-green-4 text-green-38'
                      )}
                    >
                      {msg.role === 'user' ? (
                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                      ) : (
                        <MarkdownMessage content={msg.content} />
                      )}
                      <div className="text-[10px] mt-1 opacity-60">
                        {format(new Date(msg.created_at), 'HH:mm')}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Pending user message */}
                {pendingUserMessage && (
                  <div className="flex justify-end">
                    <div className="rounded-lg px-3 py-2 text-xs max-w-[85%] bg-blue-5 text-green-34">
                      <div className="whitespace-pre-wrap break-words">{pendingUserMessage}</div>
                      <div className="text-[10px] mt-1 text-green-28">
                        {format(new Date(), 'HH:mm')}
                      </div>
                    </div>
                  </div>
                )}

                {/* Streaming response */}
                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="rounded-lg px-3 py-2 text-xs max-w-[85%] bg-green-4 text-green-38">
                      {displayContent ? (
                        <MarkdownMessage content={displayContent} />
                      ) : (
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-green-24 rounded-full animate-pulse" />
                          <div className="w-2 h-2 bg-green-24 rounded-full animate-pulse delay-100" />
                          <div className="w-2 h-2 bg-green-24 rounded-full animate-pulse delay-200" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Thread input */}
          <form onSubmit={handleSend} className="mt-2 flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Reply in thread..."
              disabled={isStreaming}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs rounded-md border transition-colors",
                "bg-grayscale-8 border-green-6",
                "focus:outline-none focus:ring-1 focus:ring-blue-19 focus:border-blue-19",
                "placeholder:text-green-24 text-green-38"
              )}
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!message.trim() || isStreaming}
              className="h-7 w-7 p-0"
            >
              {isStreaming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
