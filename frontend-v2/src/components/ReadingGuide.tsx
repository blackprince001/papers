import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightIcon, BookOpenIcon, CheckCircleIcon, EditIcon, HelpIcon, RefreshIcon, SaveIcon, WarningIcon } from '@/components/icons';
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

interface ReadingGuideProps {
  paperId: number;
}

export function ReadingGuide({ paperId }: ReadingGuideProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editedGuide, setEditedGuide] = useState<string>('');
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (!isPolling) return;
    const timer = setTimeout(() => setIsPolling(false), 60000);
    return () => clearTimeout(timer);
  }, [isPolling]);

  const { data: guide, isLoading, error } = useQuery({
    queryKey: ['ai-reading-guide', paperId],
    queryFn: () => aiFeaturesApi.getReadingGuide(paperId),
    retry: 1,
    refetchInterval: isPolling ? 3000 : false,
  });

  const generateMutation = useMutation({
    mutationFn: () => aiFeaturesApi.generateReadingGuide(paperId),
    onMutate: () => {
      setIsPolling(true);
      toastInfo('Regenerating reading guide…', 'It will be updated shortly.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-reading-guide', paperId] });
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    },
    onError: () => setIsPolling(false),
  });

  const updateMutation = useMutation({
    mutationFn: (guideData: any) => aiFeaturesApi.updateReadingGuide(paperId, guideData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-reading-guide', paperId] });
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

  const guideData = guide?.guide || {};

  if (editing) {
    return (
      <div className="space-y-4">
        <Textarea
          value={editedGuide || JSON.stringify(guideData, null, 2)}
          onChange={(e) => setEditedGuide(e.target.value)}
          rows={15}
          className="w-full text-caption bg-(--white)"
          autoFocus
        />
        <div className="flex items-center gap-2">
          <Button
            className="h-8 text-caption"
            onClick={() => {
              try {
                const parsed = JSON.parse(editedGuide);
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
              setEditedGuide('');
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const renderSection = (title: string, items: string[], type: 'pre' | 'during' | 'post') => {
    if (!items || items.length === 0) return null;

    const icons = {
      pre: <HelpIcon size="sm" className="text-(--sky-blue)" />,
      during: <ArrowRightIcon size="sm" className="text-(--success-green)" />,
      post: <CheckCircleIcon size="sm" className="text-(--muted-foreground)" />,
    };

    return (
      <div className="space-y-4">
        <h4 className="text-caption font-bold uppercase tracking-wider text-(--muted-foreground) flex items-center gap-2">
          {icons[type]}
          {title}
        </h4>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="p-3 bg-(--muted)/20 rounded-xl border border-(--border) group hover:border-(--muted-foreground)/30 transition-colors">
              <div className="prose prose-sm max-w-none text-code leading-relaxed text-(--foreground)">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm, remarkMath]} 
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    p: ({ children }) => <span className="block">{children}</span>,
                    a: ({ href, children }) => <a href={href} className="text-(--sky-blue) hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                  }}
                >
                  {item}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const hasContent = guideData.pre_reading?.length || guideData.during_reading?.length || guideData.post_reading?.length;

  return (
    <div className="space-y-8">
      {hasContent ? (
        <>
          {renderSection("Pre-Reading Questions", guideData.pre_reading || [], 'pre')}
          {renderSection("During Reading", guideData.during_reading || [], 'during')}
          {renderSection("Post-Reading Questions", guideData.post_reading || [], 'post')}
          
          <div className="flex items-center gap-2 pt-6 border-t border-(--border)">
            <Button
              variant="ghost"
              className="h-8 text-caption px-3"
              onClick={() => {
                setEditedGuide(JSON.stringify(guideData, null, 2));
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
          <BookOpenIcon size={40} className="mb-4 text-(--muted-foreground) opacity-40" />
          <h3 className="text-btn font-semibold text-(--foreground) mb-2">No Reading Guide</h3>
          <p className="text-code text-(--muted-foreground) mb-6 max-w-60">
            Generate questions to help you stay focused and extract the most value from this paper.
          </p>
          <Button
            onClick={() => generateMutation.mutate()}
            loading={generateMutation.isPending}
            className="px-6"
          >
            <BookOpenIcon size="md" className="mr-2" />
            Generate Guide
          </Button>
        </div>
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
