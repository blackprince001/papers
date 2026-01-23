from typing import Any

from google.genai import types

from app.celery_app import celery_app
from app.core.config import settings
from app.core.logger import get_logger
from app.tasks.base import BaseAITask
from app.utils.json_extractor import extract_json_from_text

logger = get_logger(__name__)

QUERY_UNDERSTANDING_PROMPT = """Analyze this research query and extract key information:

Query: {query}

Return a JSON object with:
{{
  "main_topic": "primary research topic",
  "subtopics": ["subtopic1", "subtopic2"],
  "key_concepts": ["concept1", "concept2"],
  "search_intent": "what the user is looking for",
  "suggested_filters": {{
    "year_range": [start_year, end_year] or null,
    "domains": ["domain1", "domain2"]
  }}
}}"""

OVERVIEW_PROMPT = """Based on these research papers about "{query}", provide a brief overview:

Papers summary:
{papers_summary}

Return a JSON object with:
{{
  "overview": "2-3 paragraph overview of the research landscape",
  "key_themes": ["theme1", "theme2", "theme3"],
  "research_gaps": ["gap1", "gap2"],
  "recommended_reading_order": ["paper_title1", "paper_title2"]
}}"""

CLUSTERING_PROMPT = """Group these research papers into thematic clusters:

Papers:
{papers_json}

Return a JSON object with:
{{
  "clusters": [
    {{
      "name": "cluster name",
      "description": "what papers in this cluster have in common",
      "paper_indices": [0, 1, 2]
    }}
  ],
  "outliers": [index_of_outlier_papers]
}}"""

RELEVANCE_PROMPT = """For the query "{query}", explain why each paper is relevant:

Papers:
{papers_json}

Return a JSON array where each element has:
{{
  "index": paper_index,
  "relevance_score": 0.0-1.0,
  "relevance_explanation": "why this paper is relevant to the query",
  "key_contributions": ["contribution1", "contribution2"]
}}"""


@celery_app.task(bind=True, base=BaseAITask, name="search.understand_query")
def understand_query_task(self, query: str) -> dict[str, Any]:
  """Analyze and understand a search query."""
  client = self.client
  if not client:
    return {"status": "error", "error": "No AI client available"}

  try:
    prompt = QUERY_UNDERSTANDING_PROMPT.format(query=query)
    response = client.models.generate_content(
      model=settings.GENAI_MODEL,
      contents=types.Part.from_text(text=prompt),
    )
    text = response.text if hasattr(response, "text") else str(response)

    parsed = extract_json_from_text(text)
    if isinstance(parsed, dict):
      logger.info("Query understood", query=query[:50])
      return {"status": "success", "query": query, "understanding": parsed}

    return {"status": "error", "error": "Invalid response format"}

  except Exception as e:
    logger.error("Error understanding query", query=query[:50], error=str(e))
    raise


@celery_app.task(bind=True, base=BaseAITask, name="search.generate_overview")
def generate_overview_task(self, query: str, papers_summary: str) -> dict[str, Any]:
  """Generate an overview of search results."""
  client = self.client
  if not client:
    return {"status": "error", "error": "No AI client available"}

  try:
    prompt = OVERVIEW_PROMPT.format(query=query, papers_summary=papers_summary)
    response = client.models.generate_content(
      model=settings.GENAI_MODEL,
      contents=types.Part.from_text(text=prompt),
    )
    text = response.text if hasattr(response, "text") else str(response)

    parsed = extract_json_from_text(text)
    if isinstance(parsed, dict):
      logger.info("Generated overview", query=query[:50])
      return {"status": "success", "query": query, "overview": parsed}

    return {"status": "error", "error": "Invalid response format"}

  except Exception as e:
    logger.error("Error generating overview", query=query[:50], error=str(e))
    raise


@celery_app.task(bind=True, base=BaseAITask, name="search.cluster_papers")
def cluster_papers_task(self, papers_json: str) -> dict[str, Any]:
  """Cluster papers into thematic groups."""
  client = self.client
  if not client:
    return {"status": "error", "error": "No AI client available"}

  try:
    prompt = CLUSTERING_PROMPT.format(papers_json=papers_json)
    response = client.models.generate_content(
      model=settings.GENAI_MODEL,
      contents=types.Part.from_text(text=prompt),
    )
    text = response.text if hasattr(response, "text") else str(response)

    parsed = extract_json_from_text(text)
    if isinstance(parsed, dict):
      logger.info("Clustered papers")
      return {"status": "success", "clusters": parsed}

    return {"status": "error", "error": "Invalid response format"}

  except Exception as e:
    logger.error("Error clustering papers", error=str(e))
    raise


@celery_app.task(bind=True, base=BaseAITask, name="search.explain_relevance")
def explain_relevance_task(self, query: str, papers_json: str) -> dict[str, Any]:
  """Explain why each paper is relevant to the query."""
  client = self.client
  if not client:
    return {"status": "error", "error": "No AI client available"}

  try:
    prompt = RELEVANCE_PROMPT.format(query=query, papers_json=papers_json)
    response = client.models.generate_content(
      model=settings.GENAI_MODEL,
      contents=types.Part.from_text(text=prompt),
    )
    text = response.text if hasattr(response, "text") else str(response)

    parsed = extract_json_from_text(text)
    if isinstance(parsed, (list, dict)):
      logger.info("Explained relevance", query=query[:50])
      return {"status": "success", "query": query, "relevance": parsed}

    return {"status": "error", "error": "Invalid response format"}

  except Exception as e:
    logger.error("Error explaining relevance", query=query[:50], error=str(e))
    raise
