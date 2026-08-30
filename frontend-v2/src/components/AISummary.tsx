import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EditIcon, RefreshIcon, SaveIcon, SparklesIcon, WarningIcon } from '@/components/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Skeleton } from '@/components/ui/Skeleton';
import { aiFeaturesApi } from '@/lib/api/aiFeatures';
import { toastInfo } from '@/lib/utils/toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { SetupIllustration } from '@/components/illustrations';

interface AISummaryProps {
  paperId: number;
}

export function AISummary({ paperId }: AISummaryProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (!isPolling) return;
    const timer = setTimeout(() => setIsPolling(false), 60000);
    return () => clearTimeout(timer);
  }, [isPolling]);

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ['ai-summary', paperId],
    queryFn: () => aiFeaturesApi.getSummary(paperId),
    retry: 1,
    refetchInterval: isPolling ? 3000 : false,
  });

  const generateMutation = useMutation({
    mutationFn: () => aiFeaturesApi.generateSummary(paperId),
    onMutate: () => {
      setIsPolling(true);
      toastInfo('Regenerating summary…', 'It will be updated shortly.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-summary', paperId] });
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    },
    onError: () => setIsPolling(false),
  });

  const updateMutation = useMutation({
    mutationFn: (summaryText: string) => aiFeaturesApi.updateSummary(paperId, summaryText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-summary', paperId] });
      setEditing(false);
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <Textarea
          value={editedSummary}
          onChange={(e) => setEditedSummary(e.target.value)}
          rows={12}
          className="w-full text-code bg-(--white)"
          placeholder="Enter AI summary..."
          autoFocus
        />
        <div className="flex items-center gap-2">
          <Button
            className="h-8 text-caption"
            onClick={() => updateMutation.mutate(editedSummary)}
            disabled={updateMutation.isPending}
          >
            <SaveIcon size="sm" className="mr-1.5" />
            Save Changes
          </Button>
          <Button
            variant="ghost"
            className="h-8 text-caption"
            onClick={() => {
              setEditing(false);
              setEditedSummary(summary?.summary || '');
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {summary?.summary ? (
        <>
          <div className="prose prose-sm max-w-none prose-p:text-body prose-p:leading-relaxed prose-p:text-[var(--foreground)] prose-headings:text-[var(--foreground)] prose-strong:text-[var(--foreground)] prose-li:text-[var(--foreground)]">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                h1: ({ children }) => <h1 className="text-subheading font-bold mt-6 mb-3 first:mt-0">{children}</h1>,
                h2: ({ children }) => <h2 className="text-body-lg font-bold mt-5 mb-2 first:mt-0">{children}</h2>,
                h3: ({ children }) => <h3 className="text-body font-bold mt-4 mb-2 first:mt-0">{children}</h3>,
                ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="marker:text-(--muted-foreground)">{children}</li>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-(--border) pl-4 italic my-4 text-(--muted-foreground)">
                    {children}
                  </blockquote>
                ),
                code: ({ className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const inline = !match;
                  return inline ? (
                    <code className="bg-(--muted) px-1 py-0.5 rounded text-caption" {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className="block bg-(--muted) p-3 rounded-lg text-caption overflow-x-auto my-4 border border-(--border)" {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {summary.summary}
            </ReactMarkdown>
          </div>
          
          <div className="flex items-center gap-2 pt-4 border-t border-(--border)">
            <Button
              variant="ghost"
              className="h-8 text-caption px-3"
              onClick={() => {
                setEditedSummary(summary.summary);
                setEditing(true);
              }}
            >
              <EditIcon size="sm" className="mr-1.5" />
              Edit
            </Button>
            <Button
              variant="outlined"
              className="h-8 text-caption px-3 ml-auto border-(--sky-blue)/30 hover:bg-(--sky-blue)/10 text-(--sky-blue)"
              onClick={() => generateMutation.mutate()}
              loading={generateMutation.isPending}
            >
              <RefreshIcon size="sm" className="mr-1.5" />
              Regenerate
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          size="panel"
          illustration={SetupIllustration}
          title="No summary available"
          description="Generate an AI-powered summary to quickly understand the core message of this paper."
          actions={
            <Button
              onClick={() => generateMutation.mutate()}
              loading={generateMutation.isPending}
              className="px-6"
            >
              <SparklesIcon size="md" className="mr-2" />
              Generate Summary
            </Button>
          }
          className="bg-(--muted)/20 rounded-2xl border border-dashed border-(--border)"
        />
      )}

      {(generateMutation.isError || error) && (
        <div className="p-4 bg-(--destructive)/5 border border-(--destructive)/20 rounded-xl flex items-start gap-3">
          <WarningIcon size="md" className="text-(--destructive) shrink-0 mt-0.5" />
          <div>
            <p className="text-caption font-semibold text-(--destructive)">Something went wrong</p>
            <p className="text-caption text-(--destructive)/80 mt-1 uppercase">
              {generateMutation.error instanceof Error ? generateMutation.error.message : 'Server error'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
