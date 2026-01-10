import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useMemo, useRef, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { papersApi, type CitationGraph } from '@/lib/api/papers';

interface CitationGraphProps {
  paperId: number;
  bidirectional?: boolean;
  maxHops?: number;
}

export function CitationGraph({ paperId, bidirectional = true, maxHops = 1 }: CitationGraphProps) {
  const navigate = useNavigate();
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const { data: graphData, isLoading, error } = useQuery<CitationGraph>({
    queryKey: ['citation-graph', paperId, bidirectional, maxHops],
    queryFn: () => papersApi.getCitationGraph(paperId, bidirectional, maxHops),
    enabled: !!paperId,
  });

  // Process graph data with color coding and node sizing
  const processedData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };

    const nodes = graphData.nodes.map((node) => {
      const isCurrentPaper = typeof node.id === 'number' && node.id === paperId;
      const isExternal = node.type === 'external';

      // Determine node color
      let color = '#94a3b8'; // gray for external
      if (isCurrentPaper)
      {
        color = '#3b82f6'; // blue for current paper
      } else if (!isExternal)
      {
        color = '#10b981'; // green for internal papers
      }

      // Calculate node size based on connectivity (very small sizes for better visibility)
      const linkCount = graphData.edges.filter(
        (edge) => edge.source === node.id || edge.target === node.id
      ).length;
      const size = isCurrentPaper ? 4 : Math.max(2, Math.min(3, 2 + linkCount * 0.2));

      return {
        ...node,
        color,
        size,
        isCurrentPaper,
        isExternal,
      };
    });

    // Determine if edge is incoming (paper cites current) or outgoing (current cites paper)
    const links = graphData.edges.map((edge) => {
      const isIncoming = typeof edge.target === 'number' && edge.target === paperId;
      return {
        source: edge.source,
        target: edge.target,
        color: isIncoming ? '#fbbf24' : '#cbd5e1', // orange for incoming, light gray for outgoing
        type: edge.type || 'cites',
        isIncoming,
      };
    });

    return { nodes, links };
  }, [graphData, paperId]);

  // Measure container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current)
      {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0)
        {
          setDimensions({ width: rect.width, height: rect.height });
        }
      }
    };

    // Initial measurement
    updateDimensions();

    // Update on window resize
    window.addEventListener('resize', updateDimensions);

    // Also check periodically in case container size changes (e.g., layout shift)
    const interval = setInterval(updateDimensions, 1000);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      clearInterval(interval);
    };
  }, [processedData]); // Re-measure when processed data is ready

  // Configure force simulation for better spacing
  useEffect(() => {
    if (graphRef.current && processedData.nodes.length > 0)
    {
      // Access the internal d3 simulation to configure forces
      const simulation = (graphRef.current as any).d3Force?.();
      if (simulation)
      {
        // Increase link distance
        const linkForce = simulation.force('link');
        if (linkForce)
        {
          linkForce.distance(200);
          linkForce.strength(0.25);
        }

        // Increase charge repulsion for better spacing
        const chargeForce = simulation.force('charge');
        if (chargeForce)
        {
          chargeForce.strength(-600);
        }

        // Reduce center force
        const centerForce = simulation.force('center');
        if (centerForce)
        {
          centerForce.strength(0.03);
        }
      }
    }
  }, [processedData]);

  // Center graph on current paper node
  useEffect(() => {
    if (graphRef.current && processedData.nodes.length > 0)
    {
      const currentPaperNode = processedData.nodes.find((n) => n.isCurrentPaper);
      if (currentPaperNode)
      {
        // Focus on the current paper node after a short delay to allow graph to stabilize
        setTimeout(() => {
          graphRef.current?.zoomToFit(400, 100, (node: any) => node.isCurrentPaper || false);
        }, 100);
      }
    }
  }, [processedData]);

  const handleNodeClick = (node: any) => {
    // Only navigate if it's an internal paper (not external, not current paper)
    if (typeof node.id === 'number' && !node.isExternal && node.id !== paperId)
    {
      navigate(`/papers/${node.id}`);
    }
  };

  if (isLoading)
  {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-sm text-anara-light-text-muted">Loading citation graph...</div>
      </div>
    );
  }

  if (error)
  {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-sm text-red-600">
          Failed to load citation graph. Please try again later.
        </div>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0 || graphData.nodes.length === 1)
  {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <h3>Citation Graph</h3>

          <p className="text-sm text-anara-light-text-muted mb-2">
            No citations found for this paper.
          </p>
          <p className="text-xs text-anara-light-text-muted/70">
            Citation relationships will appear here once the paper has been processed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      <h3>Citation Graph</h3>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 pb-3 border-b border-anara-light-border text-xs flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-anara-light-text-muted">Current Paper</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-anara-light-text-muted">In Library</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-gray-400"></div>
          <span className="text-anara-light-text-muted">External</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-gray-300"></div>
          <span className="text-anara-light-text-muted">Cites</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-amber-400"></div>
          <span className="text-anara-light-text-muted">Cited By</span>
        </div>
      </div>

      {/* Graph Container */}
      <div ref={containerRef} className="flex-1 rounded border border-anara-light-border overflow-hidden relative min-h-[400px]">
        <ForceGraph2D
          ref={graphRef}
          graphData={processedData}
          width={dimensions.width}
          height={dimensions.height}
          nodeLabel={(node: any) => node.title}
          nodeColor={(node: any) => node.color}
          nodeVal={(node: any) => node.size}
          linkColor={(link: any) => link.color}
          linkWidth={(link: any) => link.isIncoming ? 1.2 : 0.8}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={1}
          onNodeClick={handleNodeClick}
          nodeCanvasObjectMode={() => 'after'}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const label = node.title;
            const fontSize = 9 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#374151';

            // Truncate long titles
            const maxWidth = 70 / globalScale;
            let displayLabel = label;
            if (ctx.measureText(label).width > maxWidth)
            {
              displayLabel = label.substring(0, Math.floor((maxWidth / ctx.measureText(label).width) * label.length)) + '...';
            }

            ctx.fillText(displayLabel, node.x, node.y + node.size + 8 / globalScale);
          }}
          d3AlphaDecay={0.0228}
          d3VelocityDecay={0.4}
          cooldownTicks={150}
          onEngineStop={() => {
            // Re-center on current paper after graph stabilizes
            if (graphRef.current)
            {
              const currentPaperNode = processedData.nodes.find((n) => n.isCurrentPaper);
              if (currentPaperNode)
              {
                graphRef.current.zoomToFit(400, 100, (node: any) => node.isCurrentPaper || false);
              }
            }
          }}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
      </div>

      {/* Instructions */}
      <div className="mt-3 pt-3 border-t border-anara-light-border">
        <p className="text-xs text-anara-light-text-muted">
          Click on internal papers (green) to navigate to them. Drag to pan, scroll to zoom.
        </p>
      </div>
    </div>
  );
}

