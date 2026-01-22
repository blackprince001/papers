import { Sparkles, TrendingUp, HelpCircle, Search, Lightbulb } from 'lucide-react';
import type { SearchOverview, QueryUnderstanding } from '@/lib/api/discovery';

interface SearchOverviewPanelProps {
  overview: SearchOverview;
  queryUnderstanding?: QueryUnderstanding;
  onSuggestedSearch?: (query: string) => void;
}

export function SearchOverviewPanel({
  overview,
  queryUnderstanding,
  onSuggestedSearch,
}: SearchOverviewPanelProps) {
  return (
    <div className="bg-gradient-to-br from-green-4 to-grayscale-8 border border-green-6 rounded-lg p-6 mb-6">
      {/* Query Understanding */}
      {queryUnderstanding && (
        <div className="mb-4 pb-4 border-b border-green-6">
          <div className="flex items-start gap-2 mb-2">
            <Lightbulb className="w-5 h-5 text-green-28 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-anara-light-text text-sm">
                Understanding your search
              </h3>
              <p className="text-green-34 text-sm mt-1">
                {queryUnderstanding.interpreted_query}
              </p>
            </div>
          </div>
          {queryUnderstanding.key_concepts.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 ml-7">
              {queryUnderstanding.key_concepts.map((concept, i) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-green-4 text-green-38 text-xs rounded-full border border-green-6"
                >
                  {concept}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Overview */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-green-28" />
          <h3 className="font-medium text-anara-light-text">Research Overview</h3>
        </div>
        <p className="text-green-34 text-sm leading-relaxed whitespace-pre-line">
          {overview.overview}
        </p>
      </div>

      {/* Key Themes */}
      {overview.key_themes.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-28" />
            <h4 className="text-sm font-medium text-anara-light-text">Key Themes</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {overview.key_themes.map((theme, i) => (
              <span
                key={i}
                className="px-3 py-1 bg-blue-14 text-blue-38 text-xs rounded-full"
              >
                {theme}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notable Trends */}
      {overview.notable_trends.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-green-34 mb-2">Notable Trends</h4>
          <ul className="space-y-1">
            {overview.notable_trends.map((trend, i) => (
              <li key={i} className="text-sm text-green-34 flex items-start gap-2">
                <span className="text-green-28 mt-1">•</span>
                {trend}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Research Gaps */}
      {overview.research_gaps.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-4 h-4 text-amber-500" />
            <h4 className="text-sm font-medium text-anara-light-text">Research Gaps</h4>
          </div>
          <ul className="space-y-1">
            {overview.research_gaps.map((gap, i) => (
              <li key={i} className="text-sm text-green-34 flex items-start gap-2">
                <span className="text-amber-500 mt-1">•</span>
                {gap}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested Follow-ups */}
      {overview.suggested_followups.length > 0 && onSuggestedSearch && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Search className="w-4 h-4 text-green-28" />
            <h4 className="text-sm font-medium text-anara-light-text">Explore Further</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {overview.suggested_followups.map((query, i) => (
              <button
                key={i}
                onClick={() => onSuggestedSearch(query)}
                className="px-3 py-1.5 bg-grayscale-8 text-green-34 text-xs rounded-lg border border-green-6 hover:bg-green-4 hover:text-green-38 transition-colors"
              >
                {query}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
