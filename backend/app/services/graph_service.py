from typing import Any, Dict, List, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.paper import Paper
from app.models.paper_citation import PaperCitation


class GraphService:
  async def build_citation_graph(
    self,
    session: AsyncSession,
    paper_id: int,
    include_bidirectional: bool = True,
    max_hops: int = 1,
  ) -> Dict[str, Any]:
    """Build citation graph for a paper with bidirectional connections and multi-hop support."""
    nodes_dict: Dict[Any, Dict[str, Any]] = {}  # Use dict to avoid duplicates
    edges: List[Dict[str, Any]] = []

    # Fetch the main paper first
    paper_query = select(Paper).where(Paper.id == paper_id)
    paper_result = await session.execute(paper_query)
    paper = paper_result.scalar_one_or_none()

    if not paper:
      return {"nodes": [], "edges": []}

    nodes_dict[paper.id] = {"id": paper.id, "title": paper.title, "type": "paper"}

    # Get outgoing citations FROM this paper
    citations_query = select(PaperCitation).where(PaperCitation.paper_id == paper_id)
    citations_result = await session.execute(citations_query)
    citations = citations_result.scalars().all()

    # Collect all cited paper IDs for batch query
    cited_paper_ids = [
      cast(int, c.cited_paper_id) for c in citations if c.cited_paper_id is not None
    ]

    # Batch fetch all cited papers in a single query
    cited_papers_map: Dict[int, Paper] = {}
    if cited_paper_ids:
      cited_papers_query = select(Paper).where(Paper.id.in_(cited_paper_ids))
      cited_papers_result = await session.execute(cited_papers_query)
      cited_papers_map = {
        cast(int, p.id): p for p in cited_papers_result.scalars().all()
      }

    # Process outgoing citations using pre-fetched data
    for citation in citations:
      if citation.cited_paper_id is not None:
        cited_paper = cited_papers_map.get(cast(int, citation.cited_paper_id))
        if cited_paper:
          nodes_dict[cited_paper.id] = {
            "id": cited_paper.id,
            "title": cited_paper.title,
            "type": "paper",
          }
          edges.append(
            {
              "source": paper.id,
              "target": cited_paper.id,
              "type": "cites",
            }
          )
      else:
        # External paper (no internal ID)
        node_id = f"ext_{citation.id}"
        nodes_dict[node_id] = {
          "id": node_id,
          "title": citation.external_paper_title or "Unknown",
          "type": "external",
        }
        edges.append(
          {
            "source": paper.id,
            "target": node_id,
            "type": "cites",
          }
        )

    # Add bidirectional connections: papers that cite THIS paper (incoming citations)
    if include_bidirectional:
      incoming_citations_query = select(PaperCitation).where(
        PaperCitation.cited_paper_id == paper_id
      )
      incoming_result = await session.execute(incoming_citations_query)
      incoming_citations = incoming_result.scalars().all()

      # Batch fetch all citing papers
      citing_paper_ids = [cast(int, c.paper_id) for c in incoming_citations]
      citing_papers_map: Dict[int, Paper] = {}
      if citing_paper_ids:
        citing_papers_query = select(Paper).where(Paper.id.in_(citing_paper_ids))
        citing_papers_result = await session.execute(citing_papers_query)
        citing_papers_map = {
          cast(int, p.id): p for p in citing_papers_result.scalars().all()
        }

      # Process incoming citations using pre-fetched data
      for citation in incoming_citations:
        citing_paper = citing_papers_map.get(cast(int, citation.paper_id))
        if citing_paper:
          nodes_dict[citing_paper.id] = {
            "id": citing_paper.id,
            "title": citing_paper.title,
            "type": "paper",
          }
          edges.append(
            {
              "source": citing_paper.id,
              "target": paper.id,
              "type": "cites",
            }
          )

      # Multi-hop: find papers cited by papers that cite this paper (2-hop)
      if max_hops >= 2 and citing_paper_ids:
        # Batch fetch all 2-hop citations
        hop2_citations_query = (
          select(PaperCitation)
          .where(PaperCitation.paper_id.in_(citing_paper_ids))
          .where(PaperCitation.cited_paper_id != paper_id)
        )
        hop2_result = await session.execute(hop2_citations_query)
        hop2_citations = hop2_result.scalars().all()

        # Collect all hop2 paper IDs for batch fetch
        hop2_paper_ids = [
          cast(int, c.cited_paper_id)
          for c in hop2_citations
          if c.cited_paper_id is not None
        ]
        hop2_papers_map: Dict[int, Paper] = {}
        if hop2_paper_ids:
          hop2_papers_query = select(Paper).where(Paper.id.in_(hop2_paper_ids))
          hop2_papers_result = await session.execute(hop2_papers_query)
          hop2_papers_map = {
            cast(int, p.id): p for p in hop2_papers_result.scalars().all()
          }

        # Process hop2 citations using pre-fetched data
        for hop2_citation in hop2_citations:
          if hop2_citation.cited_paper_id is not None:
            hop2_paper = hop2_papers_map.get(cast(int, hop2_citation.cited_paper_id))
            if hop2_paper and hop2_paper.id not in nodes_dict:
              nodes_dict[hop2_paper.id] = {
                "id": hop2_paper.id,
                "title": hop2_paper.title,
                "type": "paper",
              }
              edges.append(
                {
                  "source": hop2_citation.paper_id,
                  "target": hop2_paper.id,
                  "type": "cites",
                }
              )

    return {"nodes": list(nodes_dict.values()), "edges": edges}

  async def get_timeline_data(self, session: AsyncSession) -> List[Dict[str, Any]]:
    """Get timeline data for all papers."""
    query = select(Paper).order_by(Paper.created_at)
    result = await session.execute(query)
    papers = result.scalars().all()

    timeline = []
    for paper in papers:
      year = paper.created_at.year if paper.created_at is not None else None
      timeline.append(
        {
          "id": paper.id,
          "title": paper.title,
          "year": year,
          "date": paper.created_at.isoformat()
          if paper.created_at is not None
          else None,
        }
      )

    return timeline

  async def build_semantic_graph(
    self, session: AsyncSession, paper_id: int, limit: int = 10
  ) -> Dict[str, Any]:
    """Build semantic similarity graph."""
    paper_query = select(Paper).where(Paper.id == paper_id)
    result = await session.execute(paper_query)
    paper = result.scalar_one_or_none()

    if not paper or paper.embedding is None:
      return {"nodes": [], "edges": []}

    # Find similar papers using embeddings
    from sqlalchemy import text

    vector_str = "[" + ",".join(str(x) for x in paper.embedding) + "]"
    similarity_query = text(f"""
      SELECT id, title, 1 - (embedding <=> '{vector_str}'::vector) as similarity
      FROM papers
      WHERE id != :paper_id AND embedding IS NOT NULL
      ORDER BY embedding <=> '{vector_str}'::vector
      LIMIT :limit
    """)

    sim_result = await session.execute(
      similarity_query, {"paper_id": paper_id, "limit": limit}
    )
    rows = sim_result.fetchall()

    nodes = [{"id": paper.id, "title": paper.title, "type": "paper"}]
    edges = []

    for row in rows:
      nodes.append({"id": row[0], "title": row[1], "type": "paper"})
      edges.append(
        {
          "source": paper.id,
          "target": row[0],
          "similarity": float(row[2]),
          "type": "similar",
        }
      )

    return {"nodes": nodes, "edges": edges}


graph_service = GraphService()
