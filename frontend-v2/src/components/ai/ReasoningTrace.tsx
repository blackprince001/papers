import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  BookOpenIcon,
  CheckIcon,
  ChevronRightIcon,
  GlobeIcon,
  WarningIcon,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  toolLabel,
  type Activity,
  type ActivityThought,
  type ActivityTool,
} from '@/lib/ai/reasoning';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const WEB_TOOLS = new Set(['web_search']);
const PAPER_TOOLS = new Set([
  'search_discovery', 'search_papers', 'semantic_search', 'get_recommendations',
  'discovery_get_paper_details', 'discovery_get_citations', 'get_citations',
  'get_references', 'get_paper_content', 'get_paper_metadata',
]);

const COUNT_RE = /(\d[\d,]*)\s+(paper|result|citation|work|author|source)s?/i;

/** "Discovered 47 academic papers" flavor from a tool's free-text result. */
function completedLabel(item: ActivityTool): string {
  const m = item.result?.match(COUNT_RE);
  if (m) {
    const noun = m[2].toLowerCase();
    if (noun === 'paper') return `Discovered ${m[1]} papers`;
    return `Found ${m[1]} ${noun}s`;
  }
  return toolLabel(item.tool);
}

/** A reasoning statement and the tool steps that ran under it. */
interface Section {
  id: number;
  header: ActivityThought | null;
  tools: ActivityTool[];
}

/** Group the flat activity feed into sections keyed by each reasoning block. */
function toSections(activity: Activity[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const item of activity) {
    if (item.kind === 'thought') {
      current = { id: item.id, header: item, tools: [] };
      sections.push(current);
    } else {
      if (!current) {
        current = { id: -1, header: null, tools: [] };
        sections.push(current);
      }
      current.tools.push(item);
    }
  }
  return sections;
}

/**
 * The agent's live reasoning trace — reasoning statements as collapsible
 * sections, each grouping the tool steps that ran under it, on one connected
 * timeline with a "Thinking… → Thought for Ns" outer collapse. Shared by chat
 * and deep research so both read identically.
 */
export function ReasoningTrace({
  activity,
  running,
  thinkingMs,
  hasReport,
}: {
  activity: Activity[];
  running: boolean;
  thinkingMs: number | null;
  hasReport: boolean;
}) {
  const reduce = useReducedMotion();
  const thinking = running && !hasReport;
  // null = follow the default (open while thinking, folded once the answer
  // starts); a boolean is the user's explicit toggle and wins.
  const [topOverride, setTopOverride] = useState<boolean | null>(null);
  const [sectionOverride, setSectionOverride] = useState<Record<number, boolean>>({});

  const sections = useMemo(() => toSections(activity), [activity]);

  if (activity.length === 0 && !thinking) return null;

  const secs = thinkingMs != null ? Math.max(1, Math.round(thinkingMs / 1000)) : null;
  const headerLabel = thinking ? 'Thinking' : secs != null ? `Thought for ${secs}s` : 'Reasoning';
  const collapsible = !thinking;
  const topOpen = thinking ? true : (topOverride ?? !hasReport);

  // While running, keep the active (last) section open and let earlier ones
  // fold as the agent moves on; the user's explicit toggle always wins.
  const lastId = sections.length ? sections[sections.length - 1].id : -1;
  const isSectionOpen = (s: Section) =>
    sectionOverride[s.id] ?? (running && s.id === lastId);

  // Flatten to timeline rows so the connector line stays continuous across the
  // mix of visible section headers and (expanded) tool steps.
  type Row =
    | { key: string; kind: 'header'; section: Section }
    | { key: string; kind: 'tool'; tool: ActivityTool };
  const rows: Row[] = [];
  sections.forEach((s) => {
    if (s.header) rows.push({ key: `h${s.id}`, kind: 'header', section: s });
    if (!s.header || isSectionOpen(s)) {
      s.tools.forEach((t) => rows.push({ key: `t${t.id}`, kind: 'tool', tool: t }));
    }
  });

  return (
    <div>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setTopOverride((o) => !(o ?? !hasReport))}
          className="group flex items-center gap-1 text-body text-(--muted-foreground) hover:text-(--foreground) transition-colors"
        >
          <span>{headerLabel}</span>
          <ChevronRightIcon
            size={15}
            className={cn('transition-transform duration-200', topOpen && 'rotate-90')}
          />
        </button>
      ) : (
        <span className="flex items-center gap-1.5 text-body text-(--muted-foreground)">
          {headerLabel}
          <span className="inline-flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1 h-1 rounded-full bg-(--muted-foreground)"
                animate={reduce ? {} : { opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
              />
            ))}
          </span>
        </span>
      )}

      <AnimatePresence initial={false}>
        {topOpen && rows.length > 0 && (
          <motion.div
            initial={reduce ? undefined : { height: 0, opacity: 0 }}
            animate={reduce ? undefined : { height: 'auto', opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="pt-3">
              {rows.map((row, i) =>
                row.kind === 'header' ? (
                  <SectionHeader
                    key={row.key}
                    section={row.section}
                    open={isSectionOpen(row.section)}
                    isLast={i === rows.length - 1}
                    reduce={!!reduce}
                    onToggle={() =>
                      setSectionOverride((m) => ({
                        ...m,
                        [row.section.id]: !isSectionOpen(row.section),
                      }))
                    }
                  />
                ) : (
                  <ToolStep
                    key={row.key}
                    item={row.tool}
                    isLast={i === rows.length - 1}
                    reduce={!!reduce}
                  />
                ),
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Connector({ show }: { show: boolean }) {
  if (!show) return null;
  return <div className="w-px flex-1 bg-(--border) my-1 min-h-2" />;
}

function SectionHeader({
  section,
  open,
  isLast,
  reduce,
  onToggle,
}: {
  section: Section;
  open: boolean;
  isLast: boolean;
  reduce: boolean;
  onToggle: () => void;
}) {
  const header = section.header!;
  const first = firstLine(header.content);
  const full = header.content.trim();

  return (
    <motion.div
      initial={reduce ? undefined : { opacity: 0, x: -4 }}
      animate={reduce ? undefined : { opacity: 1, x: 0 }}
      transition={{ duration: 0.16, ease: EASE_OUT }}
      className="flex gap-2.5"
    >
      <div className="flex flex-col items-center shrink-0">
        <span className="w-4 h-4 rounded-full border border-(--muted-foreground)/40 flex items-center justify-center">
          <CheckIcon size={9} className="text-(--muted-foreground)" />
        </span>
        <Connector show={!isLast} />
      </div>

      <div className="flex-1 min-w-0 pb-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-start gap-1 text-left text-code leading-snug text-(--foreground) hover:opacity-70 transition-opacity w-full"
        >
          <ChevronRightIcon
            size={13}
            className={cn('mt-0.5 shrink-0 opacity-60 transition-transform duration-150', open && 'rotate-90')}
          />
          <span className={cn('flex-1 min-w-0', open ? 'whitespace-pre-wrap' : 'truncate')}>
            {open ? full : first}
          </span>
        </button>
      </div>
    </motion.div>
  );
}

function StepIcon({ item }: { item: ActivityTool }) {
  if (item.status === 'running') {
    return (
      <span className="w-4 h-4 rounded-full border border-dashed border-(--muted-foreground)/60 animate-pulse" />
    );
  }
  if (item.status === 'error') {
    return <WarningIcon size={15} className="text-amber-500" />;
  }
  if (WEB_TOOLS.has(item.tool)) return <GlobeIcon size={15} className="text-(--muted-foreground)" />;
  if (PAPER_TOOLS.has(item.tool)) return <BookOpenIcon size={15} className="text-(--muted-foreground)" />;
  return (
    <span className="w-4 h-4 rounded-full border border-(--muted-foreground)/40 flex items-center justify-center">
      <CheckIcon size={9} className="text-(--muted-foreground)" />
    </span>
  );
}

function ToolStep({ item, isLast, reduce }: { item: ActivityTool; isLast: boolean; reduce: boolean }) {
  const [open, setOpen] = useState(false);

  const label =
    item.status === 'running'
      ? runningLabel(item)
      : item.status === 'error'
        ? `${toolLabel(item.tool)} — failed`
        : completedLabel(item);
  const canExpand = !!item.result && item.result.trim().length > 0;

  return (
    <motion.div
      initial={reduce ? undefined : { opacity: 0, x: -4 }}
      animate={reduce ? undefined : { opacity: 1, x: 0 }}
      transition={{ duration: 0.16, ease: EASE_OUT }}
      className="flex gap-2.5"
    >
      <div className="flex flex-col items-center shrink-0">
        <div className="w-4 h-4 flex items-center justify-center">
          <StepIcon item={item} />
        </div>
        <Connector show={!isLast} />
      </div>

      <div className={cn('flex-1 min-w-0', isLast ? 'pb-0.5' : 'pb-2.5')}>
        <button
          type="button"
          onClick={() => canExpand && setOpen((v) => !v)}
          disabled={!canExpand}
          className={cn(
            'flex items-start gap-1 text-left text-code leading-snug text-(--muted-foreground)',
            canExpand && 'hover:text-(--foreground) transition-colors cursor-pointer',
          )}
        >
          <span className="truncate">{label}</span>
          {canExpand && (
            <ChevronRightIcon
              size={13}
              className={cn(
                'mt-0.5 shrink-0 opacity-60 transition-transform duration-150',
                open && 'rotate-90',
              )}
            />
          )}
        </button>

        <AnimatePresence initial={false}>
          {open && canExpand && (
            <motion.pre
              initial={reduce ? undefined : { height: 0, opacity: 0 }}
              animate={reduce ? undefined : { height: 'auto', opacity: 1 }}
              exit={reduce ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="mt-1.5 text-[0.6875rem] text-(--muted-foreground) bg-(--muted)/30 rounded-lg p-2.5 max-h-56 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed"
            >
              {item.result!.length > 1200 ? `${item.result!.slice(0, 1200)}…` : item.result}
            </motion.pre>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function runningLabel(item: ActivityTool): string {
  const base = toolLabel(item.tool);
  return item.argSummary ? `${base}: “${item.argSummary}”` : base;
}

function firstLine(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find(Boolean) ?? text.trim();
  return line.length > 160 ? `${line.slice(0, 160)}…` : line;
}

export default ReasoningTrace;
