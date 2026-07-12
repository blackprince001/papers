import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EditIcon, InsightIcon, RefreshIcon, SaveIcon, WarningIcon } from '@/components/icons';
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

interface KeyFindingsProps {
  paperId: number;
}

export function KeyFindings({ paperId }: KeyFindingsProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editedFindings, setEditedFindings] = useState<string>('');
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (!isPolling) return;
    const timer = setTimeout(() => setIsPolling(false), 60000);
    return () => clearTimeout(timer);
  }, [isPolling]);

  const { data: findings, isLoading, error } = useQuery({
    queryKey: ['ai-findings', paperId],
    queryFn: () => aiFeaturesApi.getFindings(paperId),
    retry: 1,
    refetchInterval: isPolling ? 3000 : false,
  });

  const generateMutation = useMutation({
    mutationFn: () => aiFeaturesApi.extractFindings(paperId),
    onMutate: () => {
      setIsPolling(true);
      toastInfo('Extracting insights…', 'It will be updated shortly.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-findings', paperId] });
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    },
    onError: () => setIsPolling(false),
  });

  const updateMutation = useMutation({
    mutationFn: (findingsData: any) => aiFeaturesApi.updateFindings(paperId, findingsData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-findings', paperId] });
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

  const findingsData = findings?.findings || {};

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="p-3 bg-(--muted)/30 rounded-lg border border-(--border) mb-2">
          <p className="text-caption text-(--muted-foreground)">
            Note: Findings are stored as structured JSON. Edit with caution.
          </p>
        </div>
        <Textarea
          value={editedFindings || JSON.stringify(findingsData, null, 2)}
          onChange={(e) => setEditedFindings(e.target.value)}
          rows={15}
          className="w-full text-caption bg-(--white)"
          autoFocus
        />
        <div className="flex items-center gap-2">
          <Button
            className="h-8 text-caption"
            onClick={() => {
              try {
                const parsed = JSON.parse(editedFindings);
                updateMutation.mutate(parsed);
              } catch (e) {
                alert('Invalid JSON format');
              }
            }}
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
              setEditedFindings('');
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const renderSection = (title: string, items?: string[] | string) => {
    if (!items || (Array.isArray(items) && items.length === 0)) return null;

    return (
      <div className="space-y-3">
        <h4 className="text-caption font-bold uppercase tracking-wider text-(--muted-foreground) flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-(--foreground)/20" />
          {title}
        </h4>
        {Array.isArray(items) ? (
          <ul className="space-y-3 pl-1">
            {items.map((item, idx) => (
              <li key={idx} className="text-code leading-relaxed text-(--foreground) flex gap-3">
                <span className="text-(--muted-foreground) opacity-40 mt-1.5 text-micro tabular-nums shrink-0">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div className="prose-inline">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkMath]} 
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      p: ({ children }) => <span>{children}</span>,
                      a: ({ href, children }) => <a href={href} className="text-(--sky-blue) hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                      code: ({ children }) => <code className="bg-(--muted) px-1 py-0.5 rounded text-caption">{children}</code>
                    }}
                  >
                    {item}
                  </ReactMarkdown>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-code leading-relaxed text-(--foreground) prose prose-sm max-w-none prose-p:my-2 first:prose-p:mt-0">
             <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {items}
            </ReactMarkdown>
          </div>
        )}
      </div>
    );
  };

  const hasContent = Object.keys(findingsData).some(key => {
    const val = (findingsData as any)[key];
    return val && (Array.isArray(val) ? val.length > 0 : true);
  });

  return (
    <div className="space-y-8">
      {hasContent ? (
        <>
          {renderSection("Key Findings", findingsData.key_findings)}
          {renderSection("Conclusions", findingsData.conclusions)}
          {renderSection("Methodology", findingsData.methodology)}
          {renderSection("Limitations", findingsData.limitations)}
          {renderSection("Future Work", findingsData.future_work)}
          
          <div className="flex items-center gap-2 pt-6 border-t border-(--border)">
            <Button
              variant="ghost"
              className="h-8 text-caption px-3"
              onClick={() => {
                setEditedFindings(JSON.stringify(findingsData, null, 2));
                setEditing(true);
              }}
            >
              <EditIcon size="sm" className="mr-1.5" />
              Edit
            </Button>
            <Button
              variant="ghost"
              className="h-8 text-caption px-3 ml-auto"
              onClick={() => generateMutation.mutate()}
              loading={generateMutation.isPending}
            >
              <RefreshIcon size="sm" className="mr-1.5" />
              Regenerate
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center bg-(--muted)/20 rounded-2xl border border-dashed border-(--border)">
          <InsightIcon size={32} className="mb-4 text-(--muted-foreground) opacity-40" />
          <h3 className="text-btn font-semibold text-(--foreground) mb-2">Findings Not Extracted</h3>
          <p className="text-code text-(--muted-foreground) mb-6 max-w-60">
            Use AI to identify key contributions, methodology details, and limitations from this paper.
          </p>
          <Button
            onClick={() => generateMutation.mutate()}
            loading={generateMutation.isPending}
            className="px-6"
          >
            <InsightIcon size="md" className="mr-2" />
            Extract Insights
          </Button>
        </div>
      )}

      {(generateMutation.isError || error) && (
        <div className="p-4 bg-(--destructive)/5 border border-(--destructive)/20 rounded-xl flex items-start gap-3">
          <WarningIcon size="md" className="text-(--destructive) shrink-0 mt-0.5" />
          <div>
            <p className="text-caption font-semibold text-(--destructive)">Extraction failed</p>
            <p className="text-caption text-(--destructive)/80 mt-1 uppercase">
              {generateMutation.error instanceof Error ? generateMutation.error.message : 'Server error'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
