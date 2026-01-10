import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lightbulb, RefreshCw, Edit2, Save, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Button } from './Button';
import { aiFeaturesApi } from '@/lib/api/aiFeatures';
import { Textarea } from './ui/textarea';

interface KeyFindingsProps {
  paperId: number;
}

export function KeyFindings({ paperId }: KeyFindingsProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editedFindings, setEditedFindings] = useState<any>(null);

  const { data: findings, isLoading } = useQuery({
    queryKey: ['ai-findings', paperId],
    queryFn: () => aiFeaturesApi.getFindings(paperId),
  });

  const generateMutation = useMutation({
    mutationFn: () => aiFeaturesApi.extractFindings(paperId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-findings', paperId] });
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (findings: any) => aiFeaturesApi.updateFindings(paperId, findings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-findings', paperId] });
      setEditing(false);
    },
  });

  if (isLoading)
  {
    return <div className="text-sm text-gray-600">Loading findings...</div>;
  }

  const findingsData = findings?.findings || {};

  if (editing)
  {
    return (
      <div className="space-y-4">
        <Textarea
          value={JSON.stringify(editedFindings || findingsData, null, 2)}
          onChange={(e) => {
            try
            {
              setEditedFindings(JSON.parse(e.target.value));
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
              if (editedFindings)
              {
                updateMutation.mutate(editedFindings);
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
              setEditedFindings(null);
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
      {Object.keys(findingsData).length > 0 ? (
        <>
          {findingsData.key_findings && Array.isArray(findingsData.key_findings) && findingsData.key_findings.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2">Key Findings</h4>
              <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
                {findingsData.key_findings.map((finding: string, idx: number) => (
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
                      {finding}
                    </ReactMarkdown>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {findingsData.conclusions && Array.isArray(findingsData.conclusions) && findingsData.conclusions.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2">Conclusions</h4>
              <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
                {findingsData.conclusions.map((conclusion: string, idx: number) => (
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
                      {conclusion}
                    </ReactMarkdown>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {findingsData.methodology && (
            <div>
              <h4 className="font-semibold text-sm mb-2">Methodology</h4>
              <div className="text-sm text-gray-700 prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    p: ({ children }) => <p className="mb-3 last:mb-0 text-gray-700 leading-relaxed">{children}</p>,
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
                    strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    a: ({ href, children }) => <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                  }}
                >
                  {findingsData.methodology}
                </ReactMarkdown>
              </div>
            </div>
          )}
          {findingsData.limitations && Array.isArray(findingsData.limitations) && findingsData.limitations.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2">Limitations</h4>
              <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
                {findingsData.limitations.map((limitation: string, idx: number) => (
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
                      {limitation}
                    </ReactMarkdown>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {findingsData.future_work && Array.isArray(findingsData.future_work) && findingsData.future_work.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2">Future Work</h4>
              <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
                {findingsData.future_work.map((work: string, idx: number) => (
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
                      {work}
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
                setEditedFindings(findingsData);
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
          <Lightbulb className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm text-gray-600 mb-4">No key findings extracted yet</p>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Lightbulb className="h-4 w-4 mr-2" />
                Extract Findings
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

