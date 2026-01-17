import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Highlighter, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { aiFeaturesApi } from '@/lib/api/aiFeatures';

interface AutoHighlightsProps {
  paperId: number;
}

export function AutoHighlights({ paperId }: AutoHighlightsProps) {
  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: () => aiFeaturesApi.generateHighlights(paperId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">Auto-Highlights</h4>
        <Button
          variant="outline"
          size="sm"
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
              <Highlighter className="h-4 w-4 mr-2" />
              Generate Highlights
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-green-28">
        Automatically highlight important sections: methods, results, conclusions, and key contributions.
      </p>
      {generateMutation.isSuccess && generateMutation.data && (
        <div className="text-xs text-green-22 mt-2">
          ✓ Generated {generateMutation.data.count} highlights
        </div>
      )}
      {generateMutation.isError && (
        <div className="flex flex-col items-center justify-center py-6 px-4 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-red-800 mb-1">Failed to generate highlights</p>
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
