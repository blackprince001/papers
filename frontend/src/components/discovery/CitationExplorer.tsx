import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ArrowUpRight, ArrowDownRight, Loader2, AlertCircle } from 'lucide-react';
import { discoveryApi, type DiscoveredPaperPreview } from '@/lib/api/discovery';
import { DiscoveredPaperCard } from './DiscoveredPaperCard';

interface CitationExplorerProps {
  paper: DiscoveredPaperPreview;
  isOpen: boolean;
  onClose: () => void;
  onSelectPaper?: (paper: DiscoveredPaperPreview) => void;
}

type TabType = 'citations' | 'references';

export function CitationExplorer({ paper, isOpen, onClose, onSelectPaper }: CitationExplorerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('citations');

  const { data, isLoading, error } = useQuery({
    queryKey: ['citation-explorer', paper.source, paper.external_id, activeTab],
    queryFn: () =>
      discoveryApi.exploreCitations({
        source: paper.source,
        external_id: paper.external_id,
        direction: activeTab,
        limit: 20,
      }),
    enabled: isOpen,
  });

  const handleExplorePaper = (selectedPaper: DiscoveredPaperPreview) => {
    onSelectPaper?.(selectedPaper);
  };

  if (!isOpen) return null;

  const papers = activeTab === 'citations' ? data?.citations : data?.references;
  const count = activeTab === 'citations' ? data?.citations_count : data?.references_count;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-grayscale-8 border border-green-6 rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-green-6">
          <div>
            <h2 className="text-lg font-medium text-anara-light-text">Citation Explorer</h2>
            <p className="text-sm text-green-28 mt-1 line-clamp-1">{paper.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-green-4 rounded transition-colors"
          >
            <X className="w-5 h-5 text-green-28" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-green-6">
          <button
            onClick={() => setActiveTab('citations')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'citations'
                ? 'text-green-38 border-b-2 border-green-28'
                : 'text-green-28 hover:text-green-38'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            Cited By
            {data?.citations_count !== undefined && (
              <span className="ml-1 px-2 py-0.5 bg-green-4 rounded-full text-xs">
                {data.citations_count}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('references')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'references'
                ? 'text-green-38 border-b-2 border-green-28'
                : 'text-green-28 hover:text-green-38'
            }`}
          >
            <ArrowDownRight className="w-4 h-4" />
            References
            {data?.references_count !== undefined && (
              <span className="ml-1 px-2 py-0.5 bg-green-4 rounded-full text-xs">
                {data.references_count}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2 text-green-28">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading {activeTab}...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5" />
                <span>Failed to load {activeTab}</span>
              </div>
            </div>
          )}

          {!isLoading && !error && papers && papers.length === 0 && (
            <div className="text-center py-12">
              <p className="text-green-34">
                {activeTab === 'citations'
                  ? 'No papers have cited this paper yet'
                  : 'No references found for this paper'}
              </p>
            </div>
          )}

          {!isLoading && !error && papers && papers.length > 0 && (
            <div className="space-y-4">
              {papers.map((citedPaper) => (
                <DiscoveredPaperCard
                  key={`${citedPaper.source}-${citedPaper.external_id}`}
                  paper={citedPaper}
                  onExploreCitations={handleExplorePaper}
                  showCitationButton={citedPaper.source === 'semantic_scholar'}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-green-6 flex items-center justify-between">
          <div className="text-xs text-green-28">
            {count !== undefined && count > 0 && (
              <span>
                Showing {papers?.length || 0} of {count}{' '}
                {activeTab === 'citations' ? 'citing papers' : 'references'}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-green-28 hover:text-green-38 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
