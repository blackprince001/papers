import { useState } from 'react';
import { ChevronDown, ChevronUp, Tag, Sparkles } from 'lucide-react';
import type {
  ClusteringResult,
  DiscoveredPaperPreview,
  RelevanceExplanations,
} from '@/lib/api/discovery';
import { DiscoveredPaperCard } from './DiscoveredPaperCard';

interface ClusteredResultsProps {
  clustering: ClusteringResult;
  papers: DiscoveredPaperPreview[];
  relevanceExplanations?: RelevanceExplanations;
  onExploreCitations?: (paper: DiscoveredPaperPreview) => void;
}

interface ClusterSectionProps {
  name: string;
  description: string;
  keywords: string[];
  papers: DiscoveredPaperPreview[];
  relevanceMap: Map<number, { relevance: string; key_contribution: string; relevance_score: number }>;
  onExploreCitations?: (paper: DiscoveredPaperPreview) => void;
  defaultExpanded?: boolean;
}

function ClusterSection({
  name,
  description,
  keywords,
  papers,
  relevanceMap,
  onExploreCitations,
  defaultExpanded = true,
}: ClusterSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-grayscale-8 border border-green-6 rounded-lg overflow-hidden mb-4">
      {/* Cluster Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-green-4 transition-colors"
      >
        <div className="flex items-start gap-3 text-left">
          <Tag className="w-5 h-5 text-green-28 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-anara-light-text">{name}</h3>
            {description && (
              <p className="text-sm text-green-34 mt-1">{description}</p>
            )}
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {keywords.slice(0, 5).map((keyword, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-green-4 text-green-34 text-xs rounded"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-green-28">{papers.length} papers</span>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-green-28" />
          ) : (
            <ChevronDown className="w-5 h-5 text-green-28" />
          )}
        </div>
      </button>

      {/* Cluster Papers */}
      {isExpanded && (
        <div className="border-t border-green-6 p-4 space-y-3">
          {papers.map((paper, idx) => {
            const relevance = relevanceMap.get(idx);
            return (
              <div key={`${paper.source}-${paper.external_id}`}>
                <DiscoveredPaperCard
                  paper={paper}
                  onExploreCitations={onExploreCitations}
                  showCitationButton={paper.source === 'semantic_scholar'}
                />
                {relevance && (
                  <div className="mt-2 ml-4 p-3 bg-green-4 rounded-lg border border-green-6">
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-green-28 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-green-34">
                          <span className="text-green-38 font-medium">Why relevant: </span>
                          {relevance.relevance}
                        </p>
                        {relevance.key_contribution && (
                          <p className="text-sm text-green-34 mt-1">
                            <span className="text-green-38 font-medium">Key contribution: </span>
                            {relevance.key_contribution}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ClusteredResults({
  clustering,
  papers,
  relevanceExplanations,
  onExploreCitations,
}: ClusteredResultsProps) {
  // Build a map of paper index to relevance info
  const relevanceMap = new Map<number, { relevance: string; key_contribution: string; relevance_score: number }>();
  if (relevanceExplanations) {
    for (const exp of relevanceExplanations.explanations) {
      relevanceMap.set(exp.paper_index, {
        relevance: exp.relevance,
        key_contribution: exp.key_contribution,
        relevance_score: exp.relevance_score,
      });
    }
  }

  // Get papers for unclustered group
  const unclusteredPapers = clustering.unclustered_indices.map((idx) => papers[idx]).filter(Boolean);

  return (
    <div>
      {/* Render clusters */}
      {clustering.clusters.map((cluster, clusterIdx) => {
        const clusterPapers = cluster.paper_indices.map((idx) => papers[idx]).filter(Boolean);
        if (clusterPapers.length === 0) return null;

        // Build relevance map for this cluster's papers
        const clusterRelevanceMap = new Map<number, { relevance: string; key_contribution: string; relevance_score: number }>();
        cluster.paper_indices.forEach((globalIdx, localIdx) => {
          const rel = relevanceMap.get(globalIdx);
          if (rel) {
            clusterRelevanceMap.set(localIdx, rel);
          }
        });

        return (
          <ClusterSection
            key={clusterIdx}
            name={cluster.name}
            description={cluster.description}
            keywords={cluster.keywords}
            papers={clusterPapers}
            relevanceMap={clusterRelevanceMap}
            onExploreCitations={onExploreCitations}
            defaultExpanded={clusterIdx === 0} // Only first cluster expanded by default
          />
        );
      })}

      {/* Unclustered papers */}
      {unclusteredPapers.length > 0 && (
        <ClusterSection
          name="Other Results"
          description="Papers that don't fit neatly into the main topic clusters"
          keywords={[]}
          papers={unclusteredPapers}
          relevanceMap={new Map()}
          onExploreCitations={onExploreCitations}
          defaultExpanded={false}
        />
      )}
    </div>
  );
}
