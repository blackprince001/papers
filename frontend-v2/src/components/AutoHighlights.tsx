import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircleIcon, HighlighterIcon, WarningIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { aiFeaturesApi } from '@/lib/api/aiFeatures';
import { toastInfo } from '@/lib/utils/toast';

interface AutoHighlightsProps {
  paperId: number;
}

export function AutoHighlights({ paperId }: AutoHighlightsProps) {
  const queryClient = useQueryClient();
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (!isPolling) return;
    const timeout = setTimeout(() => setIsPolling(false), 60000);
    return () => clearTimeout(timeout);
  }, [isPolling]);

  useEffect(() => {
    if (!isPolling) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    }, 5000);
    return () => clearInterval(interval);
  }, [isPolling, paperId, queryClient]);

  const generateMutation = useMutation({
    mutationFn: () => aiFeaturesApi.generateHighlights(paperId),
    onMutate: () => {
      setIsPolling(true);
      toastInfo('Spawning AI agent…', 'It will identify highlights shortly.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    },
    onError: () => setIsPolling(false),
  });

  return (
    <div className="p-5 bg-(--sky-blue)/5 border border-(--sky-blue)/20 rounded-2xl">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <HighlighterIcon size="md" className="text-(--sky-blue)" />
          <h4 className="text-body font-bold">Auto-Highlights</h4>
        </div>
        <Button
          variant="outlined"
          className="h-8 text-caption px-3 border-(--sky-blue)/30 hover:bg-(--sky-blue)/10 text-(--sky-blue)"
          onClick={() => generateMutation.mutate()}
          loading={generateMutation.isPending}
        >
          Run AI Agent
        </Button>
      </div>

      <p className="text-caption text-(--muted-foreground) leading-relaxed">
        {generateMutation.isPending
          ? 'An AI agent is analyzing the paper and identifying key passages to highlight. This may take a moment.'
          : 'Spawns an AI agent to analyze the paper and automatically highlight core methods, results, and key contributions.'}
      </p>

      {generateMutation.isSuccess && generateMutation.data && (
        <div className="mt-4 flex items-center gap-2 text-caption text-(--success-green) font-medium animate-in fade-in slide-in-from-top-1 duration-300">
          <CheckCircleIcon size="sm" />
          <span>Success! {generateMutation.data.count} highlights identified and added.</span>
        </div>
      )}

      {generateMutation.isError && (
        <div className="mt-4 p-3 bg-(--destructive)/5 border border-(--destructive)/20 rounded-xl flex items-start gap-3">
          <WarningIcon size="sm" className="text-(--destructive) shrink-0 mt-0.5" />
          <div>
            <p className="text-caption font-bold text-(--destructive) uppercase tracking-tight">AI Agent Failed</p>
            <p className="text-caption text-(--destructive)/80 mt-0.5">
              {generateMutation.error instanceof Error ? generateMutation.error.message : 'Server error'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
