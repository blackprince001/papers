import { useQuery } from '@tanstack/react-query';
import { discoveryApi, type DiscoverySourceInfo } from '@/lib/api/discovery';

interface SourceSelectorProps {
  selectedSources: string[];
  onChange: (sources: string[]) => void;
}

export function SourceSelector({ selectedSources, onChange }: SourceSelectorProps) {
  const { data: sourcesResponse, isLoading } = useQuery({
    queryKey: ['discovery-sources'],
    queryFn: () => discoveryApi.getSources(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const sources = sourcesResponse?.sources || [];

  const toggleSource = (sourceName: string) => {
    if (selectedSources.includes(sourceName))
    {
      onChange(selectedSources.filter((s) => s !== sourceName));
    } else
    {
      onChange([...selectedSources, sourceName]);
    }
  };

  const selectAll = () => {
    onChange(sources.map((s) => s.name));
  };

  const selectNone = () => {
    onChange([]);
  };

  if (isLoading)
  {
    return (
      <div className="flex items-center gap-2 text-sm text-anara-light-text-muted">
        <div className="w-4 h-4 border-2 border-anara-light-border border-t-anara-light-text rounded-full animate-spin" />
        Loading sources...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-anara-light-text">Search Sources</span>
        <div className="flex gap-2 text-xs">
          <button
            onClick={selectAll}
            className="text-green-28 hover:text-green-38 transition-colors"
          >
            All
          </button>
          <span className="text-anara-light-border">|</span>
          <button
            onClick={selectNone}
            className="text-green-28 hover:text-green-38 transition-colors"
          >
            None
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {sources.map((source: DiscoverySourceInfo) => (
          <button
            key={source.name}
            onClick={() => toggleSource(source.name)}
            className={`
              px-3 py-1.5 text-sm rounded-sm border transition-all duration-200
              ${
                selectedSources.includes(source.name)
                  ? 'bg-green-4 border-green-6 text-green-38'
                  : 'bg-grayscale-8 border-green-6 text-green-28 hover:bg-green-4'
              }
            `}
            title={source.description}
          >
            <span className="flex items-center gap-1.5">
              {source.display_name}
              {source.supports_citations && (
                <span className="text-[10px] bg-green-6 px-1 rounded">cites</span>
              )}
            </span>
          </button>
        ))}
      </div>
      {selectedSources.length === 0 && (
        <p className="text-xs text-amber-600">Please select at least one source to search</p>
      )}
    </div>
  );
}
