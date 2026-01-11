import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { papersApi, type Paper } from '@/lib/api/papers';
import { SearchInput } from '@/components/SearchInput';
import { PaperCitationsList } from '@/components/PaperCitationsList';
import { CitationGraph } from '@/components/CitationGraph';
import { Button } from '@/components/Button';

export default function PaperCitations() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);

  // Fetch papers for search/selection
  const { data: papersData, isLoading: papersLoading } = useQuery({
    queryKey: ['papers', 1, 100, searchQuery],
    queryFn: () => papersApi.list(1, 100, searchQuery || undefined),
    enabled: true,
  });

  // Filter papers based on search query
  const filteredPapers = useMemo(() => {
    if (!papersData?.papers) return [];
    if (!searchQuery.trim()) return papersData.papers.slice(0, 20); // Show first 20 when no search

    const query = searchQuery.toLowerCase();
    return papersData.papers.filter(
      (paper) =>
        paper.title.toLowerCase().includes(query) ||
        paper.metadata_json?.author?.toLowerCase().includes(query) ||
        paper.doi?.toLowerCase().includes(query)
    ).slice(0, 20);
  }, [papersData, searchQuery]);

  // Fetch citations for selected paper
  const {
    data: citationsData,
    isLoading: citationsLoading,
    error: citationsError,
  } = useQuery({
    queryKey: ['citations-list', selectedPaperId],
    queryFn: () => papersApi.getCitationsList(selectedPaperId!),
    enabled: !!selectedPaperId,
  });

  // Get selected paper details
  const selectedPaper = useMemo(() => {
    if (!selectedPaperId || !papersData?.papers) return null;
    return papersData.papers.find((p) => p.id === selectedPaperId) || null;
  }, [selectedPaperId, papersData]);

  const handlePaperSelect = (paper: Paper) => {
    setSelectedPaperId(paper.id);
    setSearchQuery('');
  };

  const handlePaperClick = (paperId: number) => {
    navigate(`/papers/${paperId}`);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-medium text-gray-900 mb-4">Paper Citations</h1>

        {/* Paper Selector */}
        <div className="relative">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search papers to view citations..."
            isLoading={papersLoading}
            className="max-w-2xl"
          />

          {/* Dropdown with search results */}
          {searchQuery && filteredPapers.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-sm shadow-lg z-50 max-h-96 overflow-y-auto">
              {filteredPapers.map((paper) => (
                <button
                  key={paper.id}
                  onClick={() => handlePaperSelect(paper)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-100 border-b border-gray-100 last:border-b-0 transition-colors"
                >
                  <div className="font-medium text-sm text-gray-900 line-clamp-1">
                    {paper.title}
                  </div>
                  {paper.metadata_json?.author && (
                    <div className="text-xs text-gray-500 mt-1 line-clamp-1">
                      {paper.metadata_json.author}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Show message when no results */}
          {searchQuery && !papersLoading && filteredPapers.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-sm shadow-lg z-50 px-4 py-3 text-sm text-gray-500">
              No papers found matching "{searchQuery}"
            </div>
          )}
        </div>

        {/* Selected Paper Info */}
        {selectedPaper && (
          <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-sm">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 line-clamp-2">
                  {selectedPaper.title}
                </h2>
                {selectedPaper.metadata_json?.author && (
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedPaper.metadata_json.author}
                  </p>
                )}
              </div>
              <Button
                onClick={() => handlePaperClick(selectedPaper.id)}
                variant="outline"
                className="ml-4 flex-shrink-0"
              >
                View Paper
              </Button>
            </div>
            {citationsData && (
              <div className="mt-2 text-sm text-gray-600">
                {citationsData.citations.length} citation{citationsData.citations.length !== 1 ? 's' : ''} found
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!selectedPaper && !searchQuery && (
          <div className="mt-4 p-8 text-center text-gray-500">
            <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">Search for a paper above to view its citations and citation graph</p>
          </div>
        )}
      </div>

      {/* Main Content - Split View */}
      {selectedPaper && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Citations List */}
          <div className="flex-shrink-0 w-2/5 border-r border-gray-200 bg-white overflow-y-auto">
            <div className="p-6">
              <PaperCitationsList
                citations={citationsData?.citations || []}
                isLoading={citationsLoading}
                error={citationsError}
              />
            </div>
          </div>

          {/* Right Panel - Graph View */}
          <div className="flex-1 bg-gray-50 overflow-hidden flex flex-col">
            <div className="flex-1 min-h-0 p-6">
              <div className="h-full w-full">
                {selectedPaperId && <CitationGraph paperId={selectedPaperId} />}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

