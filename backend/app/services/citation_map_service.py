from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger import get_logger
from app.models.citation_map import (
  CitationMapCache,
  CitationMapItem,
  CitationMapPosition,
)
from app.models.paper import Paper
from app.services.access import visible_papers_clause
from app.services.semantic_scholar import semantic_scholar_service

logger = get_logger(__name__)

CACHE_TTL = timedelta(days=30)
REFERENCES_FETCH_LIMIT = 100
REFERENCES_DISPLAY_LIMIT = 50


def _lib_key(paper_id: int) -> str:
  return f"lib:{paper_id}"


def _s2_key(s2_id: str) -> str:
  return f"s2:{s2_id}"


def _authors_label(authors: Any) -> str:
  """Render an author list down to a short 'First et al.' style label."""
  if isinstance(authors, str):
    authors = [a.strip() for a in authors.split(",") if a.strip()]
  if not isinstance(authors, list) or not authors:
    return ""
  names = [str(a) for a in authors if a]
  if not names:
    return ""
  first = names[0].split()[-1] if names[0].split() else names[0]
  return first if len(names) == 1 else f"{first} et al."


def _paper_year(paper: Paper) -> int | None:
  meta = paper.metadata_json or {}
  raw = meta.get("year") or meta.get("publication_date")
  if raw:
    try:
      return int(str(raw)[:4])
    except (ValueError, TypeError):
      pass
  if paper.created_at is not None:
    return paper.created_at.year
  return None


def _paper_authors(paper: Paper) -> str:
  meta = paper.metadata_json or {}
  return _authors_label(meta.get("authors") or meta.get("author") or "")


def assemble_graph(
  focal: list[dict[str, Any]],
  references_by_focal: dict[int, list[dict[str, Any]]],
  positions: dict[str, dict[str, float]] | None = None,
) -> dict[str, Any]:
  """Pure node/edge assembly (no DB).

  ``focal`` is a list of focal-paper descriptors with at least ``id``,
  ``title``, ``authors``, ``year``, ``doi``, ``url`` and ``s2_id``. References
  (the works each focal paper builds on) are keyed by focal paper id. Reference
  nodes are de-duplicated by S2 id across focal papers; a reference cited by ≥2
  focal papers is marked ``shared``. A reference that *is* another focal paper
  collapses onto it.
  """
  positions = positions or {}
  nodes: dict[str, dict[str, Any]] = {}
  edges: dict[tuple[str, str, str], dict[str, Any]] = {}
  node_focal_links: dict[str, set[int]] = {}
  focal_s2_to_key: dict[str, str] = {}

  for f in focal:
    key = _lib_key(f["id"])
    nodes[key] = {
      "key": key,
      "s2_id": f.get("s2_id"),
      "library_paper_id": f["id"],
      "title": f.get("title") or "Untitled",
      "authors": f.get("authors") or "",
      "year": f.get("year"),
      "citation_count": f.get("citation_count"),
      "is_focal": True,
      "is_library": True,
      "shared": False,
      "doi": f.get("doi"),
      "url": f.get("url"),
    }
    if f.get("s2_id"):
      focal_s2_to_key[f["s2_id"]] = key

  def _resolve_key(neighbor: dict[str, Any]) -> str | None:
    s2_id = neighbor.get("s2_id")
    if not s2_id:
      return None
    return focal_s2_to_key.get(s2_id, _s2_key(s2_id))

  def _register(neighbor: dict[str, Any], key: str) -> None:
    if key in nodes:
      if nodes[key].get("citation_count") is None:
        nodes[key]["citation_count"] = neighbor.get("citation_count")
      return
    nodes[key] = {
      "key": key,
      "s2_id": neighbor.get("s2_id"),
      "library_paper_id": None,
      "title": neighbor.get("title") or "Untitled",
      "authors": _authors_label(neighbor.get("authors")),
      "year": neighbor.get("year"),
      "citation_count": neighbor.get("citation_count"),
      "is_focal": False,
      "is_library": False,
      "shared": False,
      "doi": neighbor.get("doi"),
      "url": neighbor.get("url"),
    }

  def _add_edge(source: str, target: str, edge_type: str) -> None:
    edges.setdefault(
      (source, target, edge_type),
      {"source": source, "target": target, "type": edge_type},
    )

  for f in focal:
    fid = f["id"]
    focal_key = _lib_key(fid)
    for ref in references_by_focal.get(fid, []):
      key = _resolve_key(ref)
      if key is None or key == focal_key:
        continue
      _register(ref, key)
      _add_edge(focal_key, key, "reference")
      if not nodes[key]["is_focal"]:
        node_focal_links.setdefault(key, set()).add(fid)

  for key, focal_ids in node_focal_links.items():
    if len(focal_ids) >= 2 and key in nodes:
      nodes[key]["shared"] = True

  node_list = []
  for node in nodes.values():
    node["position"] = positions.get(node["key"])
    node_list.append(node)

  return {"nodes": node_list, "edges": list(edges.values())}


class CitationMapService:
  async def _cache_is_fresh(self, row: CitationMapCache | None) -> bool:
    if row is None or not row.resolved:
      return False
    fetched = row.fetched_at
    if fetched is None:
      return False
    if fetched.tzinfo is None:
      fetched = fetched.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - fetched) < CACHE_TTL

  async def get_or_fetch_neighbors(
    self, session: AsyncSession, paper: Paper, *, force: bool = False
  ) -> CitationMapCache:
    """Return the cached S2 references for a paper, refreshing when stale."""
    row = await session.get(CitationMapCache, paper.id)
    if not force and await self._cache_is_fresh(row):
      return row

    meta = paper.metadata_json or {}
    s2_id = await semantic_scholar_service.resolve_paper_id(
      doi=paper.doi,
      arxiv=meta.get("arxiv_id") or meta.get("arxiv"),
      title=paper.title,
    )

    if not s2_id:
      # Could not resolve the paper on Semantic Scholar — usually a transient
      # 429, not a genuine "no references". Never poison the cache with an empty
      # *resolved* result (a fresh resolved row is trusted and never retried):
      # keep any prior good data, or leave the row unresolved so it retries.
      if row is not None:
        return row
      row = CitationMapCache(paper_id=paper.id)
      row.resolved = 0
      row.references_json = []
      row.fetched_at = datetime.now(timezone.utc)
      session.add(row)
      await session.commit()
      await session.refresh(row)
      return row

    references = await semantic_scholar_service.get_neighbors(
      s2_id, direction="references", limit=REFERENCES_FETCH_LIMIT
    )

    if row is None:
      row = CitationMapCache(paper_id=paper.id)
      session.add(row)

    row.s2_paper_id = s2_id
    row.resolved = 1
    # A transient empty fetch (e.g. throttled mid-paging) must not wipe
    # previously-resolved references; a genuinely reference-less paper stays [].
    if references or not row.references_json:
      row.references_json = references
    row.fetched_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(row)
    return row

  async def _load_focal_papers(
    self, session: AsyncSession, user_id: int
  ) -> list[Paper]:
    """Load the user's focal library papers that are still visible to them."""
    query = (
      select(Paper)
      .join(CitationMapItem, CitationMapItem.paper_id == Paper.id)
      .where(and_(CitationMapItem.user_id == user_id, visible_papers_clause(user_id)))
      .order_by(CitationMapItem.created_at.asc())
    )
    result = await session.execute(query)
    return list(result.scalars().all())

  async def _load_positions(
    self, session: AsyncSession, user_id: int
  ) -> dict[str, dict[str, float]]:
    query = select(CitationMapPosition).where(CitationMapPosition.user_id == user_id)
    result = await session.execute(query)
    return {p.node_key: {"x": p.x, "y": p.y} for p in result.scalars().all()}

  async def build_map(self, session: AsyncSession, user_id: int) -> dict[str, Any]:
    """Assemble the full citation map for a user (references only)."""
    focal_papers = await self._load_focal_papers(session, user_id)
    positions = await self._load_positions(session, user_id)

    caches: dict[int, CitationMapCache] = {}
    focal: list[dict[str, Any]] = []
    references_by_focal: dict[int, list[dict[str, Any]]] = {}

    for paper in focal_papers:
      cache = await self.get_or_fetch_neighbors(session, paper)
      caches[paper.id] = cache
      focal.append(
        {
          "id": paper.id,
          "s2_id": cache.s2_paper_id,
          "title": paper.title,
          "authors": _paper_authors(paper),
          "year": _paper_year(paper),
          "doi": paper.doi,
          "url": paper.url,
        }
      )
      refs = sorted(
        cache.references_json or [],
        key=lambda r: r.get("citation_count") or 0,
        reverse=True,
      )[:REFERENCES_DISPLAY_LIMIT]
      references_by_focal[paper.id] = refs

    graph = assemble_graph(focal, references_by_focal, positions)

    unresolved = [
      {"library_paper_id": p.id, "title": p.title}
      for p in focal_papers
      if not caches[p.id].s2_paper_id
    ]

    return {
      "nodes": graph["nodes"],
      "edges": graph["edges"],
      "focal_paper_ids": [p.id for p in focal_papers],
      "unresolved": unresolved,
    }

  async def get_cited_by(
    self,
    session: AsyncSession,
    paper: Paper,
    *,
    offset: int = 0,
    limit: int = 25,
  ) -> dict[str, Any]:
    """Fetch a page of works that cite this paper (forward citations).

    Reuses the cached Semantic Scholar id when available; never charted on the
    canvas — this powers the separate, paginated "Cited by" list view.
    """
    cache = await session.get(CitationMapCache, paper.id)
    s2_id = cache.s2_paper_id if cache and cache.s2_paper_id else None
    if s2_id is None:
      meta = paper.metadata_json or {}
      s2_id = await semantic_scholar_service.resolve_paper_id(
        doi=paper.doi,
        arxiv=meta.get("arxiv_id") or meta.get("arxiv"),
        title=paper.title,
      )

    if s2_id is None:
      return {
        "paper_id": paper.id,
        "resolved": False,
        "citations": [],
        "offset": offset,
        "limit": limit,
        "has_more": False,
      }

    citing, has_more = await semantic_scholar_service.get_neighbors_page(
      s2_id, direction="citations", offset=offset, limit=limit
    )
    return {
      "paper_id": paper.id,
      "resolved": True,
      "citations": citing,
      "offset": offset,
      "limit": limit,
      "has_more": has_more,
    }


citation_map_service = CitationMapService()
