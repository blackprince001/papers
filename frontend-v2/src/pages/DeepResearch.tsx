import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRightIcon,
  CheckCircleIcon,
  ClockIcon,
  CopyIcon,
  SearchIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { MessageAuthor } from '@/components/ai/MessageAuthor';
import { AgentStatus } from '@/components/ai/AgentStatus';
import { ReasoningTrace } from '@/components/ai/ReasoningTrace';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { CitationsPanel } from '@/components/deep-research/CitationsPanel';
import { ResearchComposer } from '@/components/deep-research/ResearchComposer';
import { useDeepResearchStream } from '@/hooks/use-deep-research-stream';
import { useTypewriter } from '@/hooks/use-typewriter';
import { deepResearchApi } from '@/lib/api/deepResearch';
import { papersApi } from '@/lib/api/papers';
import { referencesApi } from '@/lib/api/references';
import { toastError, toastSuccess } from '@/lib/utils/toast';
import { cn } from '@/lib/utils';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const DEEP_RESEARCH_MUTATIONS_ENABLED =
  import.meta.env.VITE_DEEP_RESEARCH_MUTATIONS_ENABLED === 'true';

const EXAMPLES = [
  'What are the leading approaches to long-context retrieval, and how do they compare?',
  'Summarize recent advances in mechanistic interpretability and the open questions.',
  'Which methods most reduce hallucination in RAG systems, and what is the evidence?',
];

const ERROR_HINT: Record<string, string> = {
  auth: 'Your AI provider rejected the request. Check the API key in Settings, then resume.',
  no_provider: 'No AI provider is configured. Add one in Settings, then resume.',
  max_turns: 'This is taking a while. Resume to let the research keep going.',
  timeout: 'The run timed out. Resume to continue.',
  rate_limit: 'The provider rate-limited the run. Resume to continue.',
};

// The agent ends its report with a follow-up-questions section; split it out so
// it can be rendered as its own affordance (and stripped from the prose).
const FOLLOWUP_RE = /\n#{1,4}\s*(?:suggested\s+)?follow[-\s]?up\s+questions?\s*\n/i;

function parseReport(report: string): { body: string; followUps: string[] } {
  if (!report) return { body: '', followUps: [] };
  const m = report.match(FOLLOWUP_RE);
  if (!m || m.index === undefined) return { body: report, followUps: [] };
  const body = report.slice(0, m.index).trimEnd();
  const followUps = report
    .slice(m.index + m[0].length)
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').trim())
    .map((l) => l.replace(/^["'“]+|["'”]+$/g, '').trim())
    .filter((l) => l.endsWith('?'))
    .slice(0, 4);
  return { body, followUps };
}

const REF_RE =
  /ref:(paper|citation|figure|section|annotation|note|external|author)\/([A-Za-z0-9:._-]+)/gi;

// Pull the unique `ref:kind/id` citations out of the report so they can be
// resolved and listed in the Citations panel — the same ids MarkdownMessage
// turns into inline chips. This is what makes the panel reflect what the report
// actually cites (its library sources), not only externally-discovered papers.
function extractRefs(md: string): { kind: string; id: string }[] {
  if (!md.includes('ref:')) return [];
  const seen = new Set<string>();
  const out: { kind: string; id: string }[] = [];
  for (const m of md.matchAll(REF_RE)) {
    const kind = m[1].toLowerCase();
    const id = m[2];
    const key = `${kind}/${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, id });
  }
  return out;
}

export default function DeepResearch() {
  const [params, setParams] = useSearchParams();
  const idParam = params.get('id');
  const dr = useDeepResearchStream();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const [question, setQuestion] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!idParam) return;
    const id = Number(idParam);
    if (!Number.isNaN(id)) dr.attach(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam]);

  const { detach } = dr;
  useEffect(() => () => detach(), [detach]);

  const addMutation = useMutation({
    mutationFn: (url: string) => papersApi.ingestBatch([url]),
    onSuccess: () => {
      toastSuccess('Added to library');
      queryClient.invalidateQueries({ queryKey: ['papers'] });
    },
    onError: () => toastError('Could not add to library'),
  });

  const startResearch = async (q: string) => {
    if (!DEEP_RESEARCH_MUTATIONS_ENABLED) return;
    const trimmed = q.trim();
    if (!trimmed) return;
    try {
      const created = await deepResearchApi.start(trimmed);
      setQuestion('');
      setParams({ id: String(created.id) });
    } catch {
      toastError('Could not start research');
    }
  };

  const copyReport = () => {
    if (!dr.report) return;
    navigator.clipboard?.writeText(dr.report);
    setCopied(true);
    toastSuccess('Report copied');
    window.setTimeout(() => setCopied(false), 1500);
  };

  const active = !!idParam && dr.sessionId != null;
  const isRunning = !['idle', 'paused', 'completed', 'failed', 'cancelled'].includes(dr.status);
  const { body, followUps } = useMemo(() => parseReport(dr.report), [dr.report]);
  // Reveal the report with the same typewriter chat uses; flush instantly once done.
  const displayedBody = useTypewriter(body, dr.status !== 'running');

  // Inline library citations, resolved to real entries, so the Citations panel
  // enumerates what the report cites even when no external sources were found.
  const refs = useMemo(() => extractRefs(body), [body]);
  const refsKey = refs.map((r) => `${r.kind}/${r.id}`).join(',');
  const { data: refResolved } = useQuery({
    queryKey: ['dr-references', dr.sessionId, refsKey],
    queryFn: () => referencesApi.resolveBatch(refs),
    enabled: dr.status === 'completed' && refs.length > 0,
    staleTime: 300_000,
  });
  const references = refResolved?.entries ?? [];

  // Recent runs — surfaced under the prompts so past research is one click away.
  // Only completed runs; failed/paused/running ones aren't useful to reopen here.
  const { data: recent = [] } = useQuery({
    queryKey: ['deep-research-sessions'],
    queryFn: () => deepResearchApi.list(12, 0),
  });
  const recentCompleted = recent.filter((r) => r.status === 'completed');

  if (!active) {
    return (
      <div className="min-h-full flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10">
          <motion.div
            initial={{ opacity: 0, y: reduce ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="w-full max-w-2xl"
          >
            <h1 className="text-center text-[1.75rem] sm:text-[2rem] font-semibold tracking-tight mb-6">
              What would you like to research today?
            </h1>
            {!DEEP_RESEARCH_MUTATIONS_ENABLED && (
              <div
                role="status"
                className="mb-4 rounded-xl border border-(--border) bg-(--muted)/40 px-4 py-3 text-code text-(--muted-foreground)"
              >
                Deep Research is temporarily paused while its safety and recovery
                workflow is being rebuilt. Existing reports remain available.
              </div>
            )}
            <ResearchComposer
              value={question}
              onChange={setQuestion}
              onSubmit={() => startResearch(question)}
              disabled={!DEEP_RESEARCH_MUTATIONS_ENABLED}
              autoFocus
            />
            <div className="mt-3 flex flex-col gap-1.5">
              {EXAMPLES.map((ex, i) => (
                <motion.button
                  key={ex}
                  type="button"
                  onClick={() => startResearch(ex)}
                  disabled={!DEEP_RESEARCH_MUTATIONS_ENABLED}
                  initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: reduce ? 0 : 0.1 + i * 0.05, ease: EASE_OUT }}
                  className="text-left text-code text-(--muted-foreground) leading-snug rounded-lg px-3 py-2 hover:text-(--foreground) hover:bg-(--muted)/50 transition-colors"
                >
                  {ex}
                </motion.button>
              ))}
            </div>

            {recentCompleted.length > 0 && (
              <div className="mt-6">
                <p className="text-caption uppercase tracking-wider text-(--muted-foreground) font-medium mb-1.5 px-3">
                  Recent
                </p>
                <div className="flex flex-col">
                  {recentCompleted.slice(0, 5).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setParams({ id: String(r.id) })}
                      className="group flex items-center justify-between gap-3 text-left rounded-lg px-3 py-2 hover:bg-(--muted)/50 transition-colors"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <ClockIcon size="sm" className="text-(--muted-foreground) shrink-0" />
                        <span className="text-code text-(--foreground) truncate">
                          {r.title || r.question}
                        </span>
                      </span>
                      <ArrowUpRightIcon
                        size="sm"
                        className="text-(--muted-foreground) shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* User query */}
        <div className="flex justify-end mb-6">
          <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-(--muted) px-4 py-2.5 text-body text-(--foreground)">
            {dr.question}
          </div>
        </div>

        {/* Assistant turn */}
        <div>
          <MessageAuthor role="assistant" />
          <div className="space-y-5">
            {isRunning && (
              <AgentStatus
                status={dr.reconnecting ? 'retrying' : 'running'}
                label={dr.reconnecting ? 'Reconnecting to research' : 'Working through sources'}
              />
            )}
            <ReasoningTrace
              activity={dr.activity}
              running={isRunning}
              thinkingMs={dr.thinkingMs}
              hasReport={!!body}
            />

            {dr.status === 'paused' && (
              <Banner tone="amber">
                <p className="text-code text-(--foreground) mb-3 leading-snug">
                  {(dr.errorCode && ERROR_HINT[dr.errorCode]) || dr.error || 'This run is paused.'}
                </p>
                <button
                  type="button"
                  onClick={() => dr.resume()}
                  disabled={!DEEP_RESEARCH_MUTATIONS_ENABLED}
                  className="text-code font-medium text-(--foreground) rounded-lg border border-(--border) bg-(--card) px-3 h-8 hover:bg-(--muted) active:scale-[0.98] transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Resume unavailable during rebuild
                </button>
              </Banner>
            )}

            {dr.status === 'failed' && (
              <Banner tone="red">
                <p className="text-code text-(--destructive) leading-snug">
                  {dr.error || 'This run failed. Start a new one to try again.'}
                </p>
              </Banner>
            )}

            {isRunning && !body && dr.activity.length > 0 && (
              <p className="text-code text-(--muted-foreground)">Generating answer…</p>
            )}

            {body && (
              <motion.div
                initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
              >
                {/* Rendered exactly like chat: ref: citations resolve to their
                    source (title + hover card), external links stay inline. */}
                <MarkdownMessage content={displayedBody} />
                {isRunning && (
                  <motion.span
                    aria-hidden
                    className="inline-block w-[3px] h-4 align-text-bottom bg-(--foreground) rounded-full mt-1"
                    animate={reduce ? {} : { opacity: [1, 0.15, 1] }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                )}
              </motion.div>
            )}

            {/* Copy the report — always available once done, independent of
                whether any external sources were collected for the panel. */}
            {dr.status === 'completed' && body && (
              <div className="flex items-center gap-1 -mt-1">
                <Button
                  variant="icon"
                  size="icon-xs"
                  onClick={copyReport}
                  title="Copy report"
                  aria-label="Copy report"
                >
                  {copied ? (
                    <CheckCircleIcon size="xs" className="text-(--success)" />
                  ) : (
                    <CopyIcon size="xs" />
                  )}
                </Button>
              </div>
            )}

            {dr.status === 'completed' && (dr.sources.length > 0 || references.length > 0) && (
              <CitationsPanel
                sources={dr.sources}
                references={references}
                onAdd={(url) => addMutation.mutate(url)}
                addingUrl={addMutation.isPending ? (addMutation.variables as string) : null}
              />
            )}

            {dr.status === 'completed' && followUps.length > 0 && (
              <FollowUps questions={followUps} onPick={(q) => startResearch(q)} />
            )}
          </div>
        </div>
      </div>

      {/* Pinned composer for a new research thread */}
      <div className="sticky bottom-0 w-full bg-gradient-to-t from-(--panel-surface) via-(--panel-surface) to-transparent">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-4 pt-4">
          <ResearchComposer
            value={question}
            onChange={setQuestion}
            onSubmit={() => startResearch(question)}
            disabled={!DEEP_RESEARCH_MUTATIONS_ENABLED}
            placeholder={
              DEEP_RESEARCH_MUTATIONS_ENABLED
                ? 'Ask a new research question…'
                : 'Deep Research is temporarily paused'
            }
          />
        </div>
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'amber' | 'red'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-(--border) bg-(--card) p-4 border-l-2',
        tone === 'amber' ? 'border-l-amber-500' : 'border-l-(--destructive)',
      )}
    >
      {children}
    </div>
  );
}

function FollowUps({
  questions,
  onPick,
}: {
  questions: string[];
  onPick: (q: string) => void;
}) {
  return (
    <div>
      <h4 className="text-body text-(--foreground) mb-1">Suggested follow-up questions</h4>
      <div>
        {questions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="group w-full flex items-center justify-between gap-3 py-3 border-b border-(--border) text-left hover:opacity-80 transition-opacity"
          >
            <span className="flex items-center gap-2.5 min-w-0">
                        <SearchIcon size="sm" className="text-(--muted-foreground) shrink-0" />
              <span className="text-code text-(--foreground) truncate">{q}</span>
            </span>
            <ArrowUpRightIcon
                        size="sm"
              className="text-(--muted-foreground) shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
