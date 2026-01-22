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

const markdownComponents = {
  p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc list-inside ml-2 mb-2 space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-inside ml-2 mb-2 space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="text-gray-700">{children}</li>,
  code: ({ className, children, ...props }: any) => {
    const isInline = !className;
    return isInline ? (
      <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-800" {...props}>
        {children}
      </code>
    ) : (
      <code className="block bg-gray-100 p-2 rounded text-xs font-mono text-gray-800 overflow-x-auto my-2" {...props}>
        {children}
      </code>
    );
  },
  strong: ({ children }: any) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  a: ({ href, children }: any) => (
    <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

function GuideSection({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items || items.length === 0) return null;

  const titleColors: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    purple: 'text-purple-600',
  };

  const accentColors: Record<string, string> = {
    blue: 'border-l-blue-500',
    green: 'border-l-green-500',
    purple: 'border-l-purple-500',
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h4 className={`font-semibold text-sm mb-3 ${titleColors[color] || 'text-gray-700'}`}>
        {title}
      </h4>
      <div className="space-y-2">
        {items.map((item: string, idx: number) => (
          <div key={idx} className={`flex gap-3 text-sm bg-gray-50 rounded p-3 border-l-4 ${accentColors[color] || 'border-l-gray-300'}`}>
            <span className="text-gray-500 font-medium flex-shrink-0">{idx + 1}.</span>
            <div className="prose prose-sm max-w-none flex-1 text-gray-700">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={markdownComponents}
              >
                {item}
              </ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReadingGuide({ paperId }: ReadingGuideProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
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
      setIsEditing(false);
    },
  });

  if (isLoading) {
    return <div className="text-sm text-gray-600">Loading reading guide...</div>;
  }

  const guideData = guide?.guide || {};
  const hasContent = guideData.pre_reading?.length || guideData.during_reading?.length || guideData.post_reading?.length;

  if (isEditing) {
    return (
      <div className="space-y-4">
        <Textarea
          value={JSON.stringify(editedGuide || guideData, null, 2)}
          onChange={(e) => {
            try {
              setEditedGuide(JSON.parse(e.target.value));
            } catch {
              // Invalid JSON
            }
          }}
          rows={12}
          className="font-mono text-xs"
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => editedGuide && updateMutation.mutate(editedGuide)}
            disabled={updateMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsEditing(false);
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

  if (!hasContent) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8">
          <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm text-gray-600 mb-4">No reading guide generated yet</p>
          <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
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
        {generateMutation.isError && (
          <ErrorMessage error={generateMutation.error} onRetry={() => generateMutation.mutate()} isPending={generateMutation.isPending} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GuideSection title="Pre-Reading Questions" items={guideData.pre_reading} color="blue" />
      <GuideSection title="During Reading" items={guideData.during_reading} color="green" />
      <GuideSection title="Post-Reading Questions" items={guideData.post_reading} color="purple" />

      <div className="flex items-center gap-2 pt-2 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditedGuide(guideData);
            setIsEditing(true);
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

      {generateMutation.isError && (
        <ErrorMessage error={generateMutation.error} onRetry={() => generateMutation.mutate()} isPending={generateMutation.isPending} />
      )}
    </div>
  );
}

function ErrorMessage({ error, onRetry, isPending }: { error: Error | null; onRetry: () => void; isPending: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 px-4 bg-red-50 rounded-lg border border-red-200">
      <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
      <p className="text-sm font-medium text-red-800 mb-1">Failed to generate reading guide</p>
      <p className="text-xs text-red-600 mb-4 text-center max-w-xs">
        {error?.message || 'Unable to reach the server. Please try again.'}
      </p>
      <Button onClick={onRetry} disabled={isPending} size="sm">
        {isPending ? (
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
  );
}
