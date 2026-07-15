import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodeDrag,
} from '@xyflow/react';
import { useMutation } from '@tanstack/react-query';
import { CitationGraphIcon } from '@/components/icons';
import {
  citationMapApi,
  type CitationMapResponse,
  type MapNode,
} from '@/lib/api/citationMap';
import { computeLayout } from '@/lib/citationMapLayout';
import { ReferenceNode, type ReferenceNodeData } from './ReferenceNode';

import '@xyflow/react/dist/style.css';

const NODE_TYPES = { reference: ReferenceNode };

interface CitationMapProps {
  data: CitationMapResponse | undefined;
  isLoading: boolean;
  selectedKey: string | null;
  onSelectNode: (node: MapNode | null) => void;
}

function CitationMapInner({ data, isLoading, selectedKey, onSelectNode }: CitationMapProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ReferenceNodeData>>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  const positionMutation = useMutation({
    mutationFn: (p: { node_key: string; x: number; y: number }) =>
      citationMapApi.savePositions([p]),
  });

  const layout = useMemo(() => computeLayout(data?.nodes ?? []), [data]);

  useEffect(() => {
    if (!data) return;

    const rfNodes: Node<ReferenceNodeData>[] = data.nodes.map((n) => {
      const lo = layout[n.key];
      return {
        id: n.key,
        type: 'reference',
        position: { x: lo.x, y: lo.y },
        data: { node: n, r: lo.r },
        selected: n.key === selectedKey,
      };
    });

    const rfEdges: Edge[] = data.edges.map((e, i) => ({
      id: `e-${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: 'default',
      style: { stroke: 'var(--border)', strokeWidth: 1, opacity: 0.55 },
    }));

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [data, layout, setNodes, setEdges]);

  useEffect(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === selectedKey })));
  }, [selectedKey, setNodes]);

  const handleDragStop: OnNodeDrag<Node<ReferenceNodeData>> = useCallback(
    (_e, node) => {
      positionMutation.mutate({
        node_key: node.id,
        x: node.position.x,
        y: node.position.y,
      });
    },
    [positionMutation]
  );

  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node<ReferenceNodeData>) => {
      onSelectNode(node.data.node);
    },
    [onSelectNode]
  );

  const isEmpty = !isLoading && (data?.nodes.length ?? 0) === 0;

  return (
    <div className="relative w-full h-full bg-(--background)">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeDragStop={handleDragStop}
        onNodeClick={handleNodeClick}
        onPaneClick={() => onSelectNode(null)}
        nodeTypes={NODE_TYPES}
        fitView={nodes.length > 0}
        fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border)" gap={28} size={1} />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>

      {/* Axis hints (Connected-Papers style) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-2 text-caption tracking-wide text-(--muted-foreground)/70 uppercase">
        <span className="h-px w-10 bg-(--border)" />
        More recently published
        <span className="h-px w-10 bg-(--border)" />
      </div>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 rotate-180 pointer-events-none [writing-mode:vertical-rl] flex items-center gap-2 text-caption tracking-wide text-(--muted-foreground)/70 uppercase">
        <span className="w-px h-10 bg-(--border)" />
        More citations
        <span className="w-px h-10 bg-(--border)" />
      </div>

      {isEmpty && (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center gap-2">
          <CitationGraphIcon size={36} className="text-(--border)" />
          <p className="text-code text-(--foreground)">Add a paper to chart what it built on</p>
          <p className="text-caption text-(--muted-foreground)">
            Its references are pulled from Semantic Scholar
          </p>
        </div>
      )}
    </div>
  );
}

export function CitationMap(props: CitationMapProps) {
  return (
    <ReactFlowProvider>
      <CitationMapInner {...props} />
    </ReactFlowProvider>
  );
}
