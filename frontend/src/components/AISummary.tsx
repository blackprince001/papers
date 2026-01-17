import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Edit2, Save, X, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Button } from './Button';
import { aiFeaturesApi } from '@/lib/api/aiFeatures';
import { Textarea } from './ui/textarea';
import { AlertCircle } from 'lucide-react';

interface AISummaryProps {
  paperId: number;
}

export function AISummary({ paperId }: AISummaryProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');

  const { data: summary, isLoading } = useQuery({
    queryKey: ['ai-summary', paperId],
    queryFn: () => aiFeaturesApi.getSummary(paperId),
  });

  const generateMutation = useMutation({
    mutationFn: () => aiFeaturesApi.generateSummary(paperId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-summary', paperId] });
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (summary: string) => aiFeaturesApi.updateSummary(paperId, summary),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-summary', paperId] });
      setEditing(false);
    },
  });

  if (isLoading)
  {
    return <div className="text-sm text-gray-600">Loading summary...</div>;
  }

  if (editing)
  {
    return (
      <div className="space-y-2">
        <Textarea
          value={editedSummary}
          onChange={(e) => setEditedSummary(e.target.value)}
          rows={8}
          className="w-full"
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              updateMutation.mutate(editedSummary);
            }}
            disabled={updateMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(false);
              setEditedSummary(summary?.summary || '');
            }}
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {summary?.summary ? (
        <>
          <div className="prose prose-sm max-w-none text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                p: ({ children }) => <p className="mb-3 last:mb-0 text-gray-700 leading-relaxed">{children}</p>,
                h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-4 first:mt-0 text-gray-900">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-4 first:mt-0 text-gray-900">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold mb-2 mt-3 first:mt-0 text-gray-900">{children}</h3>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1 text-gray-700">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1 text-gray-700">{children}</ol>,
                li: ({ children }) => <li className="text-gray-700">{children}</li>,
                code: ({ className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const inline = !match;
                  return inline ? (
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono text-gray-800" {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className="block bg-gray-100 p-2 rounded text-xs font-mono text-gray-800 overflow-x-auto my-2" {...props}>
                      {children}
                    </code>
                  );
                },
                blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-300 pl-3 italic text-gray-600 my-2">{children}</blockquote>,
                a: ({ href, children }) => <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
              }}
            >
              {summary.summary}
            </ReactMarkdown>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditedSummary(summary.summary);
                setEditing(true);
              }}
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
              Regenerate
            </Button>
          </div>
        </>
      ) : (
        <div className="text-center py-4">
          <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm text-gray-600 mb-4">No AI summary generated yet</p>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Summary
              </>
            )}
          </Button>
        </div>
      )}
      {generateMutation.isError && (
        <div className="flex flex-col items-center justify-center py-6 px-4 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-red-800 mb-1">Failed to generate summary</p>
          <p className="text-xs text-red-600 mb-4 text-center max-w-xs">
            {generateMutation.error?.message || 'Unable to reach the server. Please try again.'}
          </p>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            size="sm"
          >
            {generateMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Retrying...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
