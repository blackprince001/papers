from typing import Any, Dict, List

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
    # Get citations FROM this paper (outgoing)
    citations_query = select(PaperCitation).where(PaperCitation.paper_id == paper_id)
    result = await session.execute(citations_query)
    citations = result.scalars().all()

    nodes_dict = {}  # Use dict to avoid duplicates
    edges = []

    # Add current paper as node
    paper_query = select(Paper).where(Paper.id == paper_id)
    paper_result = await session.execute(paper_query)
    paper = paper_result.scalar_one_or_none()

    if not paper:
      return {"nodes": [], "edges": []}

    nodes_dict[paper.id] = {"id": paper.id, "title": paper.title, "type": "paper"}

    # Add cited papers as nodes and edges (outgoing citations)
    for citation in citations:
      if citation.cited_paper_id:
        # Internal paper
        cited_query = select(Paper).where(Paper.id == citation.cited_paper_id)
        cited_result = await session.execute(cited_query)
        cited_paper = cited_result.scalar_one_or_none()
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
        # External paper
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

      for citation in incoming_citations:
        # Get the paper that cites the current paper
        citing_paper_query = select(Paper).where(Paper.id == citation.paper_id)
        citing_result = await session.execute(citing_paper_query)
        citing_paper = citing_result.scalar_one_or_none()

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

      # Multi-hop: find papers that cite papers that cite this paper (2-hop)
      if max_hops >= 2:
        # Get papers cited by papers that cite this paper
        for citation in incoming_citations:
          citing_paper_id = citation.paper_id
          # Get citations from this citing paper
          hop2_citations_query = (
            select(PaperCitation)
            .where(PaperCitation.paper_id == citing_paper_id)
            .where(PaperCitation.cited_paper_id != paper_id)
          )  # Exclude current paper
          hop2_result = await session.execute(hop2_citations_query)
          hop2_citations = hop2_result.scalars().all()

          for hop2_citation in hop2_citations:
            if hop2_citation.cited_paper_id:
              hop2_paper_query = select(Paper).where(
                Paper.id == hop2_citation.cited_paper_id
              )
              hop2_result = await session.execute(hop2_paper_query)
              hop2_paper = hop2_result.scalar_one_or_none()

              if hop2_paper and hop2_paper.id not in nodes_dict:
                nodes_dict[hop2_paper.id] = {
                  "id": hop2_paper.id,
                  "title": hop2_paper.title,
                  "type": "paper",
                }
                edges.append(
                  {
                    "source": citing_paper_id,
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
      year = paper.created_at.year if paper.created_at else None
      timeline.append(
        {
          "id": paper.id,
          "title": paper.title,
          "year": year,
          "date": paper.created_at.isoformat() if paper.created_at else None,
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

    if not paper or not paper.embedding:
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
