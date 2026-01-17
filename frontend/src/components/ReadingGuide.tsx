import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, RefreshCw, Edit2, Save, X, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Button } from './Button';
import { aiFeaturesApi } from '@/lib/api/aiFeatures';
import { Textarea } from './ui/textarea';

interface ReadingGuideProps {
  paperId: number;
}

export function ReadingGuide({ paperId }: ReadingGuideProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editedGuide, setEditedGuide] = useState<any>(null);

  const { data: guide, isLoading } = useQuery({
    queryKey: ['ai-reading-guide', paperId],
    queryFn: () => aiFeaturesApi.getReadingGuide(paperId),
  });

  const generateMutation = useMutation({
    mutationFn: () => aiFeaturesApi.generateReadingGuide(paperId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-reading-guide', paperId] });
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (guide: any) => aiFeaturesApi.updateReadingGuide(paperId, guide),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-reading-guide', paperId] });
      setEditing(false);
    },
  });

  if (isLoading)
  {
    return <div className="text-sm text-gray-600">Loading reading guide...</div>;
  }

  const guideData = guide?.guide || {};

  if (editing)
  {
    return (
      <div className="space-y-4">
        <Textarea
          value={JSON.stringify(editedGuide || guideData, null, 2)}
          onChange={(e) => {
            try
            {
              setEditedGuide(JSON.parse(e.target.value));
            } catch
            {
              // Invalid JSON, ignore
            }
          }}
          rows={12}
          className="font-mono text-xs"
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (editedGuide)
              {
                updateMutation.mutate(editedGuide);
              }
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
              setEditedGuide(null);
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
    <div className="space-y-4">
      {Object.keys(guideData).length > 0 && (guideData.pre_reading?.length || guideData.during_reading?.length || guideData.post_reading?.length) ? (
        <>
          {guideData.pre_reading && guideData.pre_reading.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2 text-blue-600">Pre-Reading Questions</h4>
              <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
                {guideData.pre_reading.map((q: string, idx: number) => (
                  <li key={idx} className="markdown-item">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        p: ({ children }) => <span>{children}</span>,
                        ul: ({ children }) => <ul className="list-disc list-inside ml-4 mt-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside ml-4 mt-1">{children}</ol>,
                        li: ({ children }) => <li className="text-gray-700">{children}</li>,
                        code: ({ className, children, ...props }: any) => {
                          const match = /language-(\w+)/.exec(className || '');
                          const inline = !match;
                          return inline ? (
                            <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-800" {...props}>
                              {children}
                            </code>
                          ) : (
                            <code className="block bg-gray-100 p-2 rounded text-xs font-mono text-gray-800 overflow-x-auto my-2" {...props}>
                              {children}
                            </code>
                          );
                        },
                        strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        a: ({ href, children }) => <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                      }}
                    >
                      {q}
                    </ReactMarkdown>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {guideData.during_reading && guideData.during_reading.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2 text-green-600">During Reading</h4>
              <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
                {guideData.during_reading.map((q: string, idx: number) => (
                  <li key={idx} className="markdown-item">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        p: ({ children }) => <span>{children}</span>,
                        ul: ({ children }) => <ul className="list-disc list-inside ml-4 mt-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside ml-4 mt-1">{children}</ol>,
                        li: ({ children }) => <li className="text-gray-700">{children}</li>,
                        code: ({ className, children, ...props }: any) => {
                          const match = /language-(\w+)/.exec(className || '');
                          const inline = !match;
                          return inline ? (
                            <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-800" {...props}>
                              {children}
                            </code>
                          ) : (
                            <code className="block bg-gray-100 p-2 rounded text-xs font-mono text-gray-800 overflow-x-auto my-2" {...props}>
                              {children}
                            </code>
                          );
                        },
                        strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        a: ({ href, children }) => <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                      }}
                    >
                      {q}
                    </ReactMarkdown>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {guideData.post_reading && guideData.post_reading.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2 text-purple-600">Post-Reading Questions</h4>
              <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
                {guideData.post_reading.map((q: string, idx: number) => (
                  <li key={idx} className="markdown-item">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        p: ({ children }) => <span>{children}</span>,
                        ul: ({ children }) => <ul className="list-disc list-inside ml-4 mt-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside ml-4 mt-1">{children}</ol>,
                        li: ({ children }) => <li className="text-gray-700">{children}</li>,
                        code: ({ className, children, ...props }: any) => {
                          const match = /language-(\w+)/.exec(className || '');
                          const inline = !match;
                          return inline ? (
                            <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-800" {...props}>
                              {children}
                            </code>
                          ) : (
                            <code className="block bg-gray-100 p-2 rounded text-xs font-mono text-gray-800 overflow-x-auto my-2" {...props}>
                              {children}
                            </code>
                          );
                        },
                        strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        a: ({ href, children }) => <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                      }}
                    >
                      {q}
                    </ReactMarkdown>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditedGuide(guideData);
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
          <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm text-gray-600 mb-4">No reading guide generated yet</p>
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
                <BookOpen className="h-4 w-4 mr-2" />
                Generate Reading Guide
              </>
            )}
          </Button>
        </div>
      )}
      {generateMutation.isError && (
        <div className="flex flex-col items-center justify-center py-6 px-4 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-red-800 mb-1">Failed to generate reading guide</p>
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
