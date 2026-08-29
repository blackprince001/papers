import { useId, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  BookOpenIcon,
  CheckIcon,
  ChevronRightIcon,
  GlobeIcon,
  WarningIcon,
} from '@/components/icons';
import type { AIActivity } from '@/lib/ai/events';
import { cn } from '@/lib/utils';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

interface Section {
  id: string;
  header: AIActivity | null;
  tools: AIActivity[];
}

function toSections(activity: AIActivity[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const item of activity) {
    if (item.kind === 'phase') {
      current = { id: item.id, header: item, tools: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { id: `before-${item.id}`, header: null, tools: [] };
      sections.push(current);
    }
    current.tools.push(item);
  }

  return sections;
}

/** Safe activity trace shared by chat and deep research. */
export function ReasoningTrace({
  activity,
  running,
  thinkingMs,
  hasReport,
}: {
  activity: AIActivity[];
  running: boolean;
  thinkingMs: number | null;
  hasReport: boolean;
}) {
  const reduce = useReducedMotion();
  const traceId = useId().replace(/:/g, '');
  const [topOverride, setTopOverride] = useState<boolean | null>(null);
  const [sectionOverride, setSectionOverride] = useState<Record<string, boolean>>({});
  const sections = useMemo(() => toSections(activity), [activity]);

  const thinking = running && !hasReport;
  if (activity.length === 0 && !thinking) return null;

  const seconds = thinkingMs != null ? Math.max(1, Math.round(thinkingMs / 1000)) : null;
  const headerLabel = thinking ? 'Thinking' : seconds != null ? `Thought for ${seconds}s` : 'Activity';
  const collapsible = !thinking;
  const topOpen = thinking ? true : (topOverride ?? !hasReport);
  const detailsId = `${traceId}-details`;
  const lastId = sections.length ? sections[sections.length - 1].id : '';
  const isSectionOpen = (section: Section) =>
    sectionOverride[section.id] ?? (running && section.id === lastId);

  type Row =
    | { key: string; kind: 'header'; section: Section }
    | { key: string; kind: 'tool'; tool: AIActivity };
  const rows: Row[] = [];
  sections.forEach((section) => {
    if (section.header) rows.push({ key: `h-${section.id}`, kind: 'header', section });
    if (!section.header || isSectionOpen(section)) {
      section.tools.forEach((tool) => rows.push({ key: `t-${tool.id}`, kind: 'tool', tool }));
    }
  });

  return (
    <div>
      {collapsible ? (
        <button
          type="button"
          aria-expanded={topOpen}
          aria-controls={detailsId}
          onClick={() => setTopOverride((value) => !(value ?? !hasReport))}
          className="group flex items-center gap-1 text-body text-(--muted-foreground) transition-colors hover:text-(--foreground)"
        >
          <span>{headerLabel}</span>
          <ChevronRightIcon
            size="sm"
            className={cn('transition-transform duration-200', topOpen && 'rotate-90')}
          />
        </button>
      ) : (
        <span className="flex items-center gap-1.5 text-body text-(--muted-foreground)">
          {headerLabel}
          <span className="inline-flex gap-0.5" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <motion.span
                key={index}
                className="size-1 rounded-full bg-(--muted-foreground)"
                animate={reduce ? {} : { opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1.1, repeat: Infinity, delay: index * 0.18, ease: 'easeInOut' }}
              />
            ))}
          </span>
        </span>
      )}

      <AnimatePresence initial={false}>
        {topOpen && rows.length > 0 && (
          <motion.div
            id={detailsId}
            initial={reduce ? undefined : { height: 0, opacity: 0 }}
            animate={reduce ? undefined : { height: 'auto', opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="pt-3">
              {rows.map((row, index) =>
                row.kind === 'header' ? (
                  <SectionHeader
                    key={row.key}
                    section={row.section}
                    open={isSectionOpen(row.section)}
                    isLast={index === rows.length - 1}
                    reduce={!!reduce}
                    onToggle={() =>
                      setSectionOverride((current) => ({
                        ...current,
                        [row.section.id]: !isSectionOpen(row.section),
                      }))
                    }
                  />
                ) : (
                  <ToolStep
                    key={row.key}
                    item={row.tool}
                    isLast={index === rows.length - 1}
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
  return show ? <div className="my-1 min-h-2 w-px flex-1 bg-(--border)" /> : null;
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
  const label = header.label.trim();

  return (
    <motion.div
      initial={reduce ? undefined : { opacity: 0, x: -4 }}
      animate={reduce ? undefined : { opacity: 1, x: 0 }}
      transition={{ duration: 0.16, ease: EASE_OUT }}
      className="flex gap-2.5"
    >
      <div className="flex shrink-0 flex-col items-center">
        <span className="flex size-4 items-center justify-center rounded-full border border-(--muted-foreground)/40">
          <CheckIcon size="xs" className="text-(--muted-foreground)" />
        </span>
        <Connector show={!isLast} />
      </div>
      <div className="min-w-0 flex-1 pb-2.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex w-full items-start gap-1 text-left text-code leading-snug text-(--foreground) transition-opacity hover:opacity-70"
        >
          <ChevronRightIcon
            size="xs"
            className={cn('mt-0.5 shrink-0 opacity-60 transition-transform duration-150', open && 'rotate-90')}
          />
          <span className={cn('min-w-0 flex-1', open ? 'whitespace-pre-wrap' : 'truncate')}>
            {label}
          </span>
        </button>
      </div>
    </motion.div>
  );
}

function StepIcon({ item }: { item: AIActivity }) {
  if (item.state === 'running') {
    return <span className="size-4 rounded-full border border-dashed border-(--muted-foreground)/60 animate-pulse" />;
  }
  if (item.state === 'error') return <WarningIcon size="sm" className="text-amber-500" />;
  const label = item.label.toLowerCase();
  if (label.includes('web')) return <GlobeIcon size="sm" className="text-(--muted-foreground)" />;
  if (label.includes('paper') || label.includes('source') || label.includes('citation')) {
    return <BookOpenIcon size="sm" className="text-(--muted-foreground)" />;
  }
  return (
    <span className="flex size-4 items-center justify-center rounded-full border border-(--muted-foreground)/40">
      <CheckIcon size="xs" className="text-(--muted-foreground)" />
    </span>
  );
}

function ToolStep({ item, isLast, reduce }: { item: AIActivity; isLast: boolean; reduce: boolean }) {
  const [open, setOpen] = useState(false);
  const detail = item.detail?.trim();
  const label =
    item.state === 'running'
      ? detail
        ? `${item.label}: “${detail}”`
        : item.label
      : item.state === 'error'
        ? `${item.label} — failed`
        : `${item.label} — complete`;

  return (
    <motion.div
      initial={reduce ? undefined : { opacity: 0, x: -4 }}
      animate={reduce ? undefined : { opacity: 1, x: 0 }}
      transition={{ duration: 0.16, ease: EASE_OUT }}
      className="flex gap-2.5"
    >
      <div className="flex shrink-0 flex-col items-center">
        <div className="flex size-4 items-center justify-center">
          <StepIcon item={item} />
        </div>
        <Connector show={!isLast} />
      </div>
      <div className={cn('min-w-0 flex-1', isLast ? 'pb-0.5' : 'pb-2.5')}>
        <button
          type="button"
          aria-expanded={detail ? open : undefined}
          disabled={!detail}
          onClick={() => detail && setOpen((value) => !value)}
          className={cn(
            'flex items-start gap-1 text-left text-code leading-snug text-(--muted-foreground)',
            detail && 'cursor-pointer transition-colors hover:text-(--foreground)',
          )}
        >
          <span className="truncate">{label}</span>
          {detail && (
            <ChevronRightIcon
              size="xs"
              className={cn('mt-0.5 shrink-0 opacity-60 transition-transform duration-150', open && 'rotate-90')}
            />
          )}
        </button>
        <AnimatePresence initial={false}>
          {open && detail && (
            <motion.pre
              initial={reduce ? undefined : { height: 0, opacity: 0 }}
              animate={reduce ? undefined : { height: 'auto', opacity: 1 }}
              exit={reduce ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-(--muted)/30 p-2.5 text-[0.6875rem] leading-relaxed text-(--muted-foreground)"
            >
              {detail}
            </motion.pre>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default ReasoningTrace;
