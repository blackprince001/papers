import { TickCircle as Check, Warning2 as AlertTriangle } from 'iconsax-reactjs';
import { cn } from '@/lib/utils';

export interface ToolCallIndicatorProps {
  tool: string;
  status: 'running' | 'complete' | 'error';
  result?: string;
  expanded?: boolean;
  onToggle?: () => void;
}

const TOOL_LABELS: Record<string, string> = {
  get_paper_content: 'Reading paper',
  get_paper_metadata: 'Looking up paper info',
  search_papers: 'Searching papers',
  get_annotations: 'Fetching annotations',
  get_notes: 'Fetching notes',
  get_citations: 'Checking citations',
  semantic_search: 'Searching semantically',
  get_chat_history: 'Checking conversation history',
  get_chat_sessions: 'Listing sessions',
};

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] || `Running ${tool}`;
}

export function ToolCallIndicator({
  tool,
  status,
  result,
  expanded,
  onToggle,
}: ToolCallIndicatorProps) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span
        className={cn(
          'mt-0.5 shrink-0 flex items-center justify-center w-4 h-4 rounded-full',
          status === 'running' && 'text-blue-500',
          status === 'complete' && 'text-emerald-500',
          status === 'error' && 'text-amber-500',
        )}
      >
        {status === 'running' && (
          <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse" />
        )}
        {status === 'complete' && <Check size={12} variant="Bold" />}
        {status === 'error' && <AlertTriangle size={12} variant="Bold" />}
      </span>

      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={onToggle}
          disabled={!result}
          className={cn(
            'text-caption text-left',
            status === 'running' && 'text-blue-500',
            status === 'complete' && 'text-(--muted-foreground)',
            status === 'error' && 'text-amber-500',
            result && 'hover:text-(--foreground) cursor-pointer',
            !result && 'cursor-default',
          )}
        >
          {status === 'running' && `${toolLabel(tool)}...`}
          {status === 'complete' && `${toolLabel(tool)} — done`}
          {status === 'error' && `${toolLabel(tool)} — failed`}
        </button>

        {result && expanded && (
          <pre className="mt-1 text-caption text-(--muted-foreground) bg-(--muted)/30 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-[0.6875rem]">
            {result.length > 500 ? `${result.slice(0, 500)}...` : result}
          </pre>
        )}
      </div>
    </div>
  );
}

export default ToolCallIndicator;
