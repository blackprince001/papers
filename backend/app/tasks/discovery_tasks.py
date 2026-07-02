import asyncio
import json
from typing import Any

import redis

from app.celery_app import celery_app
from app.core.config import settings
from app.core.logger import get_logger
from app.tasks.base import BaseTask, sync_session_scope

logger = get_logger(__name__)

REDIS_TTL = 900  # 15 minutes — must outlast the longest AI enhancement

# Clustering and relevance run over the full result set and can take several
# minutes on slower/reasoning providers. Give each enhancement a generous
# per-task timeout (the three run concurrently, so wall-clock ≈ the slowest).
AI_ENHANCEMENT_TIMEOUT = 420.0  # 7 minutes per enhancement


def _get_redis() -> redis.Redis:
  return redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=settings.REDIS_DB,
    password=settings.REDIS_PASSWORD or None,
    decode_responses=True,
  )


def _push_progress(r: redis.Redis, search_id: str, marker: dict) -> None:
  r.rpush(f"discovery:{search_id}:progress", json.dumps(marker))
  r.expire(f"discovery:{search_id}:progress", REDIS_TTL)


@celery_app.task(
  bind=True, base=BaseTask, name="app.tasks.discovery_tasks.search_source_task"
)
def search_source_task(
  self, search_id: str, source: str, query: str, filters_dict: dict | None, limit: int
) -> None:
  from datetime import datetime, timezone

  from app.models.discovery import DiscoveredPaper
  from app.services.discovery.provider_registry import provider_registry

  r = _get_redis()
  provider = provider_registry.get(source)

  if not provider:
    _push_progress(
      r,
      search_id,
      {
        "type": "source_results",
        "source": source,
        "error": f"Unknown source: {source}",
      },
    )
    return

  try:
    filters = None
    if filters_dict:
      from app.services.discovery.base_provider import SearchFilters

      filters = SearchFilters(**filters_dict)

    papers = asyncio.run(provider.search(query, filters, limit))

    papers_data = [
      {
        "source": p.source,
        "external_id": p.external_id,
        "title": p.title,
        "authors": p.authors,
        "abstract": p.abstract,
        "year": p.year,
        "doi": p.doi,
        "arxiv_id": p.arxiv_id,
        "url": p.url,
        "pdf_url": p.pdf_url,
        "citation_count": p.citation_count,
        "relevance_score": p.relevance_score,
        "metadata": p.metadata,
      }
      for p in papers
    ]

    # Cache papers in DB
    with sync_session_scope() as session:
      for p in papers:
        try:
          from sqlalchemy import select

          existing = session.execute(
            select(DiscoveredPaper).where(
              DiscoveredPaper.source == p.source,
              DiscoveredPaper.external_id == p.external_id,
            )
          ).scalar_one_or_none()

          if existing:
            existing.last_fetched_at = datetime.now(timezone.utc)
          else:
            session.add(
              DiscoveredPaper(
                source=p.source,
                external_id=p.external_id,
                title=p.title,
                authors=p.authors,
                abstract=p.abstract,
                year=p.year,
                doi=p.doi,
                arxiv_id=p.arxiv_id,
                url=p.url,
                pdf_url=p.pdf_url,
                citation_count=p.citation_count,
                metadata_json=p.metadata,
              )
            )
        except Exception as e:
          logger.warning("Failed to cache paper", error=str(e), title=p.title)

    # Store result in Redis
    result_key = f"discovery:{search_id}:source:{source}"
    r.set(result_key, json.dumps(papers_data), ex=REDIS_TTL)

    _push_progress(
      r,
      search_id,
      {"type": "source_results", "source": source, "count": len(papers_data)},
    )

  except Exception as e:
    logger.error("search_source_task failed", source=source, error=str(e))
    _push_progress(
      r, search_id, {"type": "source_results", "source": source, "error": str(e)}
    )


@celery_app.task(
  bind=True,
  base=BaseTask,
  name="app.tasks.discovery_tasks.ai_enhance_task",
  # Override BaseTask's 5/6-minute limits — AI enhancements can legitimately
  # run longer than the default per-enhancement timeout above.
  soft_time_limit=540,  # 9 minutes
  time_limit=600,  # 10 minutes hard kill
)
def ai_enhance_task(
  self,
  search_id: str,
  query: str,
  all_papers: list[dict[str, Any]],
  include_overview: bool,
  include_clustering: bool,
  include_relevance: bool,
  user_id: int | None = None,
) -> None:
  from app.services.ai.helpers import get_provider_for_user_sync
  from app.services.discovery.ai_search_service import ai_search_service
  from app.services.discovery.base_provider import ExternalPaperResult

  r = _get_redis()

  if not all_papers:
    _push_progress(r, search_id, {"type": "complete"})
    return

  paper_results = [
    ExternalPaperResult(
      source=p["source"],
      external_id=p["external_id"],
      title=p["title"],
      authors=p.get("authors", []),
      abstract=p.get("abstract"),
      year=p.get("year"),
      doi=p.get("doi"),
      arxiv_id=p.get("arxiv_id"),
      url=p.get("url"),
      pdf_url=p.get("pdf_url"),
      citation_count=p.get("citation_count"),
      relevance_score=p.get("relevance_score"),
    )
    for p in all_papers
  ]

  provider = get_provider_for_user_sync(user_id)

  async def _run_enhancements():
    nonlocal provider
    if provider is None:
      return

    tasks: dict[str, Any] = {}
    if include_overview:
      tasks["overview"] = asyncio.create_task(
        ai_search_service.generate_search_overview(
          query, paper_results, provider=provider
        )
      )
    if include_clustering and len(paper_results) >= 3:
      tasks["clustering"] = asyncio.create_task(
        ai_search_service.cluster_papers(paper_results, provider=provider)
      )
    if include_relevance:
      tasks["relevance"] = asyncio.create_task(
        ai_search_service.explain_relevance(query, paper_results, provider=provider)
      )

    if not tasks:
      return

    async def _run_one(key: str, coro_task) -> None:
      try:
        result = await asyncio.wait_for(coro_task, timeout=AI_ENHANCEMENT_TIMEOUT)
        if result:
          r.set(
            f"discovery:{search_id}:ai:{key}",
            json.dumps(result, default=str),
            ex=REDIS_TTL,
          )
          _push_progress(r, search_id, {"type": key})
        else:
          logger.warning("AI enhancement returned no result", enhancement=key)
          _push_progress(
            r, search_id, {"type": key, "error": "no result", "incomplete": True}
          )
      except asyncio.TimeoutError:
        logger.error(
          "AI enhancement timed out", enhancement=key, timeout_s=AI_ENHANCEMENT_TIMEOUT
        )
        _push_progress(
          r, search_id, {"type": key, "error": "timed out", "incomplete": True}
        )
      except Exception as e:
        logger.error(
          "AI enhancement failed",
          enhancement=key,
          error=str(e),
          error_type=type(e).__name__,
        )
        _push_progress(
          r, search_id, {"type": key, "error": str(e)[:200], "incomplete": True}
        )

    await asyncio.gather(*(_run_one(k, t) for k, t in tasks.items()))

  asyncio.run(_run_enhancements())
  _push_progress(r, search_id, {"type": "complete"})
