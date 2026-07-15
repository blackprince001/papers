import { useState, useEffect, useRef } from 'react';
import type { ThoughtEvent } from '@/hooks/use-chat-stream';

export interface AgentThoughtPanelProps {
  thoughts: ThoughtEvent[];
  maxVisible?: number;
}

const WORDS_PER_SECOND = 12;
const REVEAL_INTERVAL_MS = 1000 / WORDS_PER_SECOND;

export function AgentThoughtPanel({ thoughts }: AgentThoughtPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [displayedLen, setDisplayedLen] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Deltas are merged upstream into one (or few) reasoning blocks; join them
  // into a single flowing text body.
  const reasoning = thoughts
    .map((t) => t.content)
    .join('')
    .trim();

  // Auto-expand while reasoning is streaming in
  useEffect(() => {
    if (reasoning.length > 0 && !expanded) {
      setExpanded(true);
    }
  }, [reasoning.length > 0]);

  // Word-by-word reveal matching the response text animation
  useEffect(() => {
    if (reasoning.length > displayedLen) {
      if (timerRef.current) clearInterval(timerRef.current);

      timerRef.current = setInterval(() => {
        setDisplayedLen((prev) => {
          if (prev >= reasoning.length) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            return prev;
          }
          const remaining = reasoning.slice(prev);
          const wordMatch = remaining.match(/^(\s*\S+)/);
          return wordMatch ? prev + wordMatch[1].length : reasoning.length;
        });
      }, REVEAL_INTERVAL_MS);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [reasoning]);

  if (!reasoning) return null;

  const visible = reasoning.slice(0, displayedLen);

  return (
    <div className="text-caption text-(--muted-foreground) rounded-lg border border-(--border) bg-(--muted)/20 px-2.5 py-2 my-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-micro font-medium hover:text-(--foreground) transition-colors"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-(--muted-foreground) animate-pulse" />
        {expanded ? 'Hide reasoning' : 'Show reasoning'}
        <span className="ml-1">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap text-micro leading-relaxed opacity-80 border-t border-(--border) pt-1.5">
          {visible}
          {displayedLen < reasoning.length && (
            <span className="inline-block w-[0.125rem] h-3 bg-(--foreground) ml-0.5 animate-pulse align-middle" />
          )}
        </div>
      )}
    </div>
  );
}

export default AgentThoughtPanel;
