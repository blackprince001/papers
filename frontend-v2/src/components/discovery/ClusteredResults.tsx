import { useMemo, useState } from 'react';
import { SparklesIcon, TagIcon } from '@/components/icons';
import type { ClusteringResult, DiscoveredPaperPreview, PaperRelevanceExplanation } from '@/lib/api/discovery';
import { DiscoveredPaperCard } from './DiscoveredPaperCard';
import { cn } from '@/lib/utils';

interface ClusteredResultsProps {
  clustering: ClusteringResult;
  papers: DiscoveredPaperPreview[];
  relevanceExplanations?: PaperRelevanceExplanation[];
}

interface ClusterPaper {
  paper: DiscoveredPaperPreview;
  relevance?: PaperRelevanceExplanation;
}

interface ClusterSection {
  name: string;
  description: string;
  keywords: string[];
  papers: ClusterPaper[];
}

export function ClusteredResults({ clustering, papers, relevanceExplanations = [] }: ClusteredResultsProps) {
  const sections = useMemo<ClusterSection[]>(() => {
    const relevanceMap = new Map(relevanceExplanations.map((e) => [e.paper_index, e]));

    const resolve = (indices: number[]): ClusterPaper[] =>
      indices
        .map((globalIdx) => ({ paper: papers[globalIdx], relevance: relevanceMap.get(globalIdx) }))
        .filter((x) => Boolean(x.paper));

    const list: ClusterSection[] = clustering.clusters
      .map((cluster) => ({
        name: cluster.name,
        description: cluster.description,
        keywords: cluster.keywords,
        papers: resolve(cluster.paper_indices),
      }))
      .filter((section) => section.papers.length > 0);

    const unclustered = resolve(clustering.unclustered_indices);
    if (unclustered.length > 0) {
      list.push({
        name: 'Other Results',
        description: "Papers that don't fit neatly into the main topic clusters",
        keywords: [],
        papers: unclustered,
      });
    }

    return list;
  }, [clustering, papers, relevanceExplanations]);

  const [activeIdx, setActiveIdx] = useState(0);
  const active = sections[activeIdx] ?? sections[0];

  if (!active) return null;

  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start">
      {/* Sidebar: cluster sections.
          Mobile: horizontal scroll with a right-edge fade to signal more tabs.
          Desktop: vertical list whose items size/wrap to their label. */}
      <div className="relative md:w-56 md:shrink-0 md:self-start md:sticky md:top-4">
        <nav className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
          {sections.map((section, idx) => {
            const isActive = idx === activeIdx;
            return (
              <button
                key={section.name + idx}
                onClick={() => setActiveIdx(idx)}
                className={cn(
                  'flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-caption transition-colors md:w-full md:items-start',
                  isActive
                    ? 'bg-(--muted) text-(--foreground) font-medium'
                    : 'text-(--muted-foreground) hover:bg-(--muted) hover:text-(--foreground)'
                )}
              >
                <span className="flex min-w-0 items-center gap-2 md:items-start">
                  <TagIcon className="w-3.5 h-3.5 shrink-0 md:mt-0.5" />
                  <span className="truncate md:overflow-visible md:whitespace-normal md:text-clip md:break-words">
                    {section.name}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-(--muted-foreground) md:mt-px">
                  {section.papers.length}
                </span>
              </button>
            );
          })}
        </nav>
        {/* Mobile-only scroll affordance */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-(--background) to-transparent md:hidden" />
      </div>

      {/* Content: selected cluster overview + papers */}
      <div className="min-w-0 flex-1">
        <div className="mb-4 rounded-xl border border-(--border) bg-(--card) p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-body font-semibold text-(--foreground)">{active.name}</h3>
            <span className="shrink-0 text-caption text-(--muted-foreground)">{active.papers.length} papers</span>
          </div>
          {active.description && (
            <p className="mt-1 text-caption text-(--muted-foreground)">{active.description}</p>
          )}
          {active.keywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {active.keywords.slice(0, 6).map((kw, i) => (
                <span
                  key={i}
                  className="rounded border border-(--border) bg-(--muted) px-2 py-0.5 text-caption text-(--muted-foreground)"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          {active.papers.map(({ paper, relevance }) => (
            <div key={`${paper.source}-${paper.external_id}`} className="flex flex-col gap-2">
              <DiscoveredPaperCard paper={paper} />
              {relevance && (
                <div className="flex items-start gap-2 rounded-lg border border-(--border) bg-(--muted) px-3 py-2">
                  <SparklesIcon className="w-3.5 h-3.5 shrink-0 text-(--muted-foreground) mt-0.5" />
                  <div className="space-y-0.5 text-caption text-(--muted-foreground)">
                    <p><span className="font-medium text-(--foreground)">Why relevant: </span>{relevance.relevance}</p>
                    {relevance.key_contribution && (
                      <p><span className="font-medium text-(--foreground)">Key contribution: </span>{relevance.key_contribution}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
