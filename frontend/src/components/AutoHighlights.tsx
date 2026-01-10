import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Highlighter, RefreshCw } from 'lucide-react';
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
    </div>
  );
}

