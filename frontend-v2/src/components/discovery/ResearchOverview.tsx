import {
  ChevronRightIcon,
  HelpIcon,
  InsightIcon,
  SearchIcon,
  SparklesIcon,
  TrendingUpIcon,
} from '@/components/icons';
import { cn } from '@/lib/utils';

export interface SearchOverview {
  overview: string;
  key_themes: string[];
  notable_trends: string[];
  research_gaps: string[];
  suggested_followups: string[];
}

export interface QueryUnderstanding {
  interpreted_query: string;
  boolean_query?: string;
  key_concepts: string[];
}

interface ResearchOverviewProps {
  overview: SearchOverview;
  queryUnderstanding?: QueryUnderstanding;
  onSuggestedSearch?: (query: string) => void;
  className?: string;
}

export function ResearchOverview({
  overview,
  queryUnderstanding,
  onSuggestedSearch,
  className,
}: ResearchOverviewProps) {
  return (
    <div className={cn(
      "bg-(--card) border border-(--border) rounded-xl overflow-hidden mb-6",
      className
    )}>
      {/* Header with AI badge */}
      <div className="px-5 py-3 border-b border-(--border) flex items-center justify-between bg-[rgba(var(--primary-rgb),0.02)]">
        <div className="flex items-center gap-2">
          <SparklesIcon size="md" className="text-(--primary)" />
          <h3 className="text-body font-semibold text-(--foreground)">AI Research Synthesis</h3>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* Query Understanding / Interpretation */}
        {queryUnderstanding && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <InsightIcon size="md" className="text-(--primary) shrink-0 mt-0.5" />
              <div>
                <p className="text-code font-medium text-(--foreground)">Understanding your search</p>
                <p className="text-code text-(--muted-foreground) mt-0.5 leading-relaxed">
                  {queryUnderstanding.interpreted_query}
                </p>
              </div>
            </div>
            {queryUnderstanding.key_concepts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 ml-6.5">
                {queryUnderstanding.key_concepts.map((concept, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-(--muted) text-(--muted-foreground) text-caption rounded border border-(--border)"
                  >
                    {concept}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* The Overview Text */}
        <div className="space-y-2">
          <p className="text-code text-(--foreground) leading-relaxed whitespace-pre-line">
            {overview.overview}
          </p>
        </div>

        {/* Themes & Trends Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
          {/* Key Themes */}
          {overview.key_themes.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <TrendingUpIcon size="sm" className="text-(--muted-foreground)" />
                <h4 className="text-caption font-semibold uppercase tracking-wider text-(--muted-foreground)">Key Themes</h4>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {overview.key_themes.map((theme, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-[rgba(var(--primary-rgb),0.05)] text-(--primary) text-caption font-medium rounded border border-[rgba(var(--primary-rgb),0.1)]"
                  >
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Research Gaps */}
          {overview.research_gaps.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <HelpIcon size="sm" className="text-(--coral-red)" />
                <h4 className="text-caption font-semibold uppercase tracking-wider text-(--muted-foreground)">Research Gaps</h4>
              </div>
              <ul className="space-y-1.5">
                {overview.research_gaps.map((gap, i) => (
                  <li key={i} className="text-caption text-(--muted-foreground) flex items-start gap-2">
                    <span className="text-(--coral-red) mt-1">•</span>
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Suggested Follow-ups */}
        {overview.suggested_followups.length > 0 && onSuggestedSearch && (
          <div className="pt-4 border-t border-(--border)">
            <div className="flex items-center gap-2 mb-3">
              <SearchIcon size="sm" className="text-(--muted-foreground)" />
              <h4 className="text-caption font-semibold uppercase tracking-wider text-(--muted-foreground)">Explore Further</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {overview.suggested_followups.map((query, i) => (
                <button
                  key={i}
                  onClick={() => onSuggestedSearch(query)}
                  className="flex items-center justify-between px-3 py-2 bg-(--muted) hover:bg-(--border) text-code text-(--foreground) rounded-lg border border-(--border) transition-colors text-left"
                >
                  <span className="truncate">{query}</span>
                  <ChevronRightIcon size="sm" className="text-(--muted-foreground) shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
