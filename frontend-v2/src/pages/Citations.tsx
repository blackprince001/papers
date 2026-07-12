import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrashIcon, InfoCircleIcon, CitationGraphIcon, QuoteIcon } from '@/components/icons';
import { citationMapApi, type CitationMapResponse, type MapNode } from '@/lib/api/citationMap';
import { CitationMap } from '@/components/citation-map/CitationMap';
import { FocalPaperPicker } from '@/components/citation-map/FocalPaperPicker';
import { NodeDetailPanel } from '@/components/citation-map/NodeDetailPanel';
import { CitedByTab } from '@/components/citation-map/CitedByTab';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { toastError } from '@/lib/utils/toast';

type Tab = 'map' | 'cited-by';

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-(--muted-foreground)">
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full bg-(--foreground)" /> Your paper
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full border-2 border-(--sky-blue)" /> Reference (work it cites)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full border-2 border-(--coral-red) bg-(--coral-red)/15" /> Shared across your papers
      </span>
    </div>
  );
}

export default function Citations() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('map');
  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);

  const { data, isLoading } = useQuery<CitationMapResponse>({
    queryKey: ['citation-map'],
    queryFn: () => citationMapApi.get(),
  });

  const clearMutation = useMutation({
    mutationFn: () => citationMapApi.clear(),
    onSuccess: () => {
      queryClient.setQueryData<CitationMapResponse>(['citation-map'], {
        nodes: [],
        edges: [],
        focal_paper_ids: [],
        unresolved: [],
      });
      setSelectedNode(null);
    },
    onError: () => toastError('Failed to clear the map'),
  });

  const focalIds = data?.focal_paper_ids ?? [];
  const unresolved = data?.unresolved ?? [];

  // Keep the selected node in sync with refreshed data (or drop it if removed).
  const liveSelected = useMemo(() => {
    if (!selectedNode || !data) return selectedNode;
    return data.nodes.find((n) => n.key === selectedNode.key) ?? null;
  }, [selectedNode, data]);

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-h))]">
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 md:pb-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1>Citations</h1>
            <p className="text-btn text-(--muted-foreground) mt-1">
              {tab === 'map'
                ? 'Chart what your papers built on — overlapping references connect across the canvas.'
                : 'See which works cite a paper in your library.'}
            </p>
          </div>
          {tab === 'map' && focalIds.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={<TrashIcon size="sm" />}
              onClick={() => clearMutation.mutate()}
              loading={clearMutation.isPending}
            >
              Clear map
            </Button>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-4">
          <TabsList>
            {(
              [
                ['map', 'Citation Map', CitationGraphIcon],
                ['cited-by', 'Cited by', QuoteIcon],
              ] as const
            ).map(([id, label, Icon]) => (
              <TabsTrigger key={id} value={id} className="flex items-center gap-1.5">
                <Icon size="sm" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {tab === 'map' && (
          <>
            <div className="mt-3">
              <Legend />
            </div>
            {unresolved.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-(--border) bg-(--muted) px-3 py-2 text-caption text-(--muted-foreground)">
                <InfoCircleIcon size="sm" className="shrink-0 mt-0.5" />
                <span>
                  Couldn’t find {unresolved.length} paper{unresolved.length !== 1 ? 's' : ''} on Semantic Scholar
                  {': '}
                  {unresolved.map((u) => u.title).slice(0, 3).join(', ')}
                  {unresolved.length > 3 ? '…' : ''}. They appear without reference links.
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {tab === 'map' ? (
        <div className="flex-1 min-h-0 mx-4 md:mx-6 mb-4 md:mb-6 flex flex-col md:flex-row rounded-xl border border-(--border) overflow-hidden bg-(--card)">
          <FocalPaperPicker focalIds={focalIds} className="w-full md:w-64 shrink-0" />
          <div className="flex-1 min-w-0 min-h-[300px] md:min-h-0">
            <CitationMap
              data={data}
              isLoading={isLoading}
              selectedKey={liveSelected?.key ?? null}
              onSelectNode={setSelectedNode}
            />
          </div>
          {liveSelected && (
            <div className="w-full md:w-80 shrink-0">
              <NodeDetailPanel node={liveSelected} onClose={() => setSelectedNode(null)} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 mx-4 md:mx-6 mb-4 md:mb-6 overflow-y-auto">
          <CitedByTab />
        </div>
      )}
    </div>
  );
}
