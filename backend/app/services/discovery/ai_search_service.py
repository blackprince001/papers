from typing import Any, Dict, List, Optional

from google.genai import errors as genai_errors
from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.core.logger import get_logger
from app.services.base_ai_service import BaseGoogleAIService
from app.services.discovery.base_provider import ExternalPaperResult
from app.utils.json_extractor import extract_json_from_text

logger = get_logger(__name__)


# Pydantic models for validating AI responses
class QueryUnderstandingResponse(BaseModel):
  """Expected structure from query understanding AI call."""

  interpreted_query: str
  key_concepts: List[str] = Field(default_factory=list)
  search_terms: List[str] = Field(default_factory=list)
  domain_hints: List[str] = Field(default_factory=list)
  query_type: str = "exploratory"


class SearchOverviewResponse(BaseModel):
  """Expected structure from search overview AI call."""

  overview: str
  key_themes: List[str] = Field(default_factory=list)
  notable_trends: List[str] = Field(default_factory=list)
  research_gaps: List[str] = Field(default_factory=list)
  suggested_followups: List[str] = Field(default_factory=list)


class ClusterResponse(BaseModel):
  """A single cluster in the clustering response."""

  name: str
  description: str = ""
  keywords: List[str] = Field(default_factory=list)
  paper_indices: List[int] = Field(default_factory=list)


class ClusteringResponse(BaseModel):
  """Expected structure from clustering AI call."""

  clusters: List[ClusterResponse] = Field(default_factory=list)
  unclustered_indices: List[int] = Field(default_factory=list)


class RelevanceExplanationItem(BaseModel):
  """A single relevance explanation."""

  paper_index: int
  relevance: str
  key_contribution: str = ""
  relevance_score: float = Field(default=0.5, ge=0.0, le=1.0)


class RelevanceResponse(BaseModel):
  """Expected structure from relevance explanation AI call."""

  explanations: List[RelevanceExplanationItem] = Field(default_factory=list)


QUERY_UNDERSTANDING_PROMPT = """Analyze this research query and extract search intent:

Query: {query}

Return a JSON object with:
{{
  "interpreted_query": "Clear interpretation of what the user is looking for",
  "key_concepts": ["concept1", "concept2", ...],
  "search_terms": ["term1", "term2", ...],
  "domain_hints": ["field1", "field2", ...],
  "query_type": "exploratory" | "specific" | "comparative" | "methodological"
}}

Guidelines:
- interpreted_query: Rephrase in clear academic terms
- key_concepts: Core ideas/topics (3-5)
- search_terms: Specific terms for database search (3-7)
- domain_hints: Research fields/domains
- query_type: exploratory (broad topic), specific (known paper/concept), comparative (comparing methods), methodological (techniques/approaches)
"""


SEARCH_OVERVIEW_PROMPT = """Generate a concise research overview based on these search results.

Query: {query}

Papers found ({paper_count} total):
{papers_summary}

Return a JSON object with:
{{
  "overview": "2-3 paragraph summary of what these results reveal about the research landscape",
  "key_themes": ["theme1", "theme2", ...],
  "notable_trends": ["trend1", "trend2", ...],
  "research_gaps": ["gap1", "gap2", ...],
  "suggested_followups": ["question1", "question2", ...]
}}

Guidelines:
- overview: Synthesize the main findings, not just list papers
- key_themes: Major topics across results (3-5)
- notable_trends: Emerging patterns or directions
- research_gaps: Areas that seem underexplored
- suggested_followups: Related queries the user might want to explore
"""


TOPIC_CLUSTERING_PROMPT = """Cluster these research papers into coherent topic groups.

Papers:
{papers_json}

Return a JSON object with:
{{
  "clusters": [
    {{
      "name": "Short cluster name",
      "description": "Brief description of this topic cluster",
      "keywords": ["keyword1", "keyword2", ...],
      "paper_indices": [0, 1, 2, ...]
    }},
    ...
  ],
  "unclustered_indices": [...]
}}

Guidelines:
- Create 3-6 meaningful clusters based on research themes
- Cluster name should be concise (2-5 words)
- Each paper should appear in exactly one cluster
- Put papers that don't fit well into unclustered_indices
- Order clusters by importance/relevance to the search
"""


RELEVANCE_EXPLANATION_PROMPT = """Explain why these papers are relevant to the search query.

Query: {query}

Papers:
{papers_json}

Return a JSON object with explanations for each paper:
{{
  "explanations": [
    {{
      "paper_index": 0,
      "relevance": "Brief explanation of why this paper is relevant (1-2 sentences)",
      "key_contribution": "Main contribution or finding",
      "relevance_score": 0.0-1.0
    }},
    ...
  ]
}}

Guidelines:
- Focus on how each paper addresses the query
- Highlight unique contributions
- Score should reflect actual relevance (0.8+ = highly relevant, 0.5-0.8 = moderately relevant, <0.5 = tangentially related)
"""


class AISearchService(BaseGoogleAIService):
  """Service for AI-powered search enhancements."""

  def _extract_response_text(self, response: Any, context: str) -> Optional[str]:
    """Safely extract text from a GenAI response.

    Args:
        response: The response from generate_content
        context: Description of the call for logging

    Returns:
        The extracted text or None if extraction failed
    """
    try:
      # Try the standard .text property first
      if hasattr(response, "text"):
        text = response.text
        if text:
          return text

      # If text is empty, check for candidates
      if hasattr(response, "candidates") and response.candidates:
        candidate = response.candidates[0]
        if hasattr(candidate, "content") and candidate.content:
          content = candidate.content
          if hasattr(content, "parts") and content.parts:
            parts_text = []
            for part in content.parts:
              if hasattr(part, "text") and part.text:
                parts_text.append(part.text)
            if parts_text:
              return "\n".join(parts_text)

        # Check for finish reason that might indicate issues
        if hasattr(candidate, "finish_reason"):
          finish_reason = candidate.finish_reason
          logger.warning(
            f"{context}: Response has finish_reason",
            finish_reason=str(finish_reason),
          )

      # Check for prompt feedback (safety blocks)
      if hasattr(response, "prompt_feedback"):
        feedback = response.prompt_feedback
        if hasattr(feedback, "block_reason") and feedback.block_reason:
          logger.error(
            f"{context}: Prompt was blocked",
            block_reason=str(feedback.block_reason),
          )
          return None

      # Last resort: convert to string
      text_str = str(response)
      if text_str and text_str not in ("None", ""):
        logger.warning(f"{context}: Using str(response) as fallback")
        return text_str

      logger.warning(f"{context}: Could not extract text from response")
      return None

    except Exception as e:
      logger.error(
        f"{context}: Exception extracting response text",
        error=str(e),
        error_type=type(e).__name__,
      )
      return None

  async def understand_query(self, query: str) -> Optional[Dict[str, Any]]:
    """Analyze a natural language query to extract search intent.

    Args:
        query: User's natural language search query

    Returns:
        Dict with interpreted query, concepts, search terms, etc.
    """
    client = self._get_client()
    if not client:
      logger.warning("No AI client available for query understanding")
      return None

    prompt = QUERY_UNDERSTANDING_PROMPT.format(query=query)

    try:
      logger.debug("Calling Gemini for query understanding", query=query[:100])
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=prompt,
      )
      text = self._extract_response_text(response, "Query understanding")
      logger.debug(
        "Query understanding raw response",
        response_length=len(text) if text else 0,
        response_preview=text[:500] if text else "empty",
      )

      if not text:
        logger.warning("Query understanding returned empty response")
        return None

      result = extract_json_from_text(text)

      if not isinstance(result, dict):
        logger.warning(
          "Query understanding returned non-dict",
          result_type=type(result).__name__,
          result_preview=str(result)[:200],
        )
        return None

      # Validate with Pydantic
      try:
        validated = QueryUnderstandingResponse(**result)
        return validated.model_dump()
      except ValidationError as ve:
        logger.warning(
          "Query understanding response validation failed",
          validation_errors=str(ve),
          raw_result=result,
        )
        # Return raw result if it has required fields
        if "interpreted_query" in result:
          return result
        return None

    except genai_errors.APIError as e:
      logger.error(
        "API error in query understanding",
        error=str(e),
        error_type=type(e).__name__,
      )
      return None
    except ValueError as e:
      logger.error(
        "JSON extraction failed in query understanding",
        error=str(e),
      )
      return None
    except Exception as e:
      logger.error(
        "Unexpected error in query understanding",
        error=str(e),
        error_type=type(e).__name__,
      )
      return None

  async def generate_search_overview(
    self,
    query: str,
    papers: List[ExternalPaperResult],
  ) -> Optional[Dict[str, Any]]:
    """Generate an overview/summary of search results.

    Args:
        query: Original search query
        papers: List of papers from search results

    Returns:
        Dict with overview, themes, trends, gaps, and followup suggestions
    """
    if not papers:
      logger.debug("No papers provided for search overview")
      return None

    client = self._get_client()
    if not client:
      logger.warning("No AI client available for search overview")
      return None

    # Build papers summary for the prompt
    papers_summary = self._build_papers_summary(
      papers[:20]
    )  # Limit to 20 for prompt length

    prompt = SEARCH_OVERVIEW_PROMPT.format(
      query=query,
      paper_count=len(papers),
      papers_summary=papers_summary,
    )

    try:
      logger.debug("Calling Gemini for search overview", paper_count=len(papers))
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=prompt,
      )
      text = self._extract_response_text(response, "Search overview")
      logger.debug(
        "Search overview raw response",
        response_length=len(text) if text else 0,
        response_preview=text[:500] if text else "empty",
      )

      if not text:
        logger.warning("Search overview returned empty response")
        return None

      result = extract_json_from_text(text)

      if not isinstance(result, dict):
        logger.warning(
          "Search overview returned non-dict",
          result_type=type(result).__name__,
        )
        return None

      # Validate with Pydantic
      try:
        validated = SearchOverviewResponse(**result)
        return validated.model_dump()
      except ValidationError as ve:
        logger.warning(
          "Search overview response validation failed",
          validation_errors=str(ve),
          raw_result_keys=list(result.keys()) if isinstance(result, dict) else None,
        )
        # Return raw result if it has required field
        if "overview" in result:
          return result
        return None

    except genai_errors.APIError as e:
      logger.error(
        "API error in search overview",
        error=str(e),
        error_type=type(e).__name__,
      )
      return None
    except ValueError as e:
      logger.error("JSON extraction failed in search overview", error=str(e))
      return None
    except Exception as e:
      logger.error(
        "Unexpected error in search overview",
        error=str(e),
        error_type=type(e).__name__,
      )
      return None

  async def cluster_papers(
    self,
    papers: List[ExternalPaperResult],
  ) -> Optional[Dict[str, Any]]:
    """Cluster papers by topic using AI.

    Args:
        papers: List of papers to cluster

    Returns:
        Dict with clusters and unclustered paper indices
    """
    if not papers or len(papers) < 3:
      logger.debug(
        "Not enough papers for clustering", paper_count=len(papers) if papers else 0
      )
      return None

    client = self._get_client()
    if not client:
      logger.warning("No AI client available for clustering")
      return None

    # Build papers JSON for the prompt
    papers_json = self._build_papers_json(papers[:30])  # Limit to 30 for prompt length

    prompt = TOPIC_CLUSTERING_PROMPT.format(papers_json=papers_json)

    try:
      logger.debug("Calling Gemini for clustering", paper_count=len(papers))
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=prompt,
      )
      text = self._extract_response_text(response, "Clustering")
      logger.debug(
        "Clustering raw response",
        response_length=len(text) if text else 0,
        response_preview=text[:500] if text else "empty",
      )

      if not text:
        logger.warning("Clustering returned empty response")
        return None

      result = extract_json_from_text(text)

      if not isinstance(result, dict):
        logger.warning(
          "Clustering returned non-dict",
          result_type=type(result).__name__,
        )
        return None

      # Validate with Pydantic
      try:
        validated = ClusteringResponse(**result)
        return validated.model_dump()
      except ValidationError as ve:
        logger.warning(
          "Clustering response validation failed",
          validation_errors=str(ve),
          raw_result_keys=list(result.keys()) if isinstance(result, dict) else None,
        )
        # Return raw result if it has clusters
        if "clusters" in result:
          return result
        return None

    except genai_errors.APIError as e:
      logger.error(
        "API error in paper clustering",
        error=str(e),
        error_type=type(e).__name__,
      )
      return None
    except ValueError as e:
      logger.error("JSON extraction failed in clustering", error=str(e))
      return None
    except Exception as e:
      logger.error(
        "Unexpected error in paper clustering",
        error=str(e),
        error_type=type(e).__name__,
      )
      return None

  async def explain_relevance(
    self,
    query: str,
    papers: List[ExternalPaperResult],
  ) -> Optional[Dict[str, Any]]:
    """Generate relevance explanations for each paper.

    Args:
        query: Original search query
        papers: List of papers to explain

    Returns:
        Dict with explanations for each paper
    """
    if not papers:
      logger.debug("No papers provided for relevance explanation")
      return None

    client = self._get_client()
    if not client:
      logger.warning("No AI client available for relevance explanation")
      return None

    # Build papers JSON for the prompt
    papers_json = self._build_papers_json(papers[:20])

    prompt = RELEVANCE_EXPLANATION_PROMPT.format(
      query=query,
      papers_json=papers_json,
    )

    try:
      logger.debug("Calling Gemini for relevance explanation", paper_count=len(papers))
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=prompt,
      )
      text = self._extract_response_text(response, "Relevance explanation")
      logger.debug(
        "Relevance explanation raw response",
        response_length=len(text) if text else 0,
        response_preview=text[:500] if text else "empty",
      )

      if not text:
        logger.warning("Relevance explanation returned empty response")
        return None

      result = extract_json_from_text(text)

      if not isinstance(result, dict):
        logger.warning(
          "Relevance explanation returned non-dict",
          result_type=type(result).__name__,
        )
        return None

      # Validate with Pydantic
      try:
        validated = RelevanceResponse(**result)
        return validated.model_dump()
      except ValidationError as ve:
        logger.warning(
          "Relevance response validation failed",
          validation_errors=str(ve),
          raw_result_keys=list(result.keys()) if isinstance(result, dict) else None,
        )
        # Return raw result if it has explanations
        if "explanations" in result:
          return result
        return None

    except genai_errors.APIError as e:
      logger.error(
        "API error in relevance explanation",
        error=str(e),
        error_type=type(e).__name__,
      )
      return None
    except ValueError as e:
      logger.error("JSON extraction failed in relevance explanation", error=str(e))
      return None
    except Exception as e:
      logger.error(
        "Unexpected error in relevance explanation",
        error=str(e),
        error_type=type(e).__name__,
      )
      return None

  async def enhance_search_results(
    self,
    query: str,
    papers: List[ExternalPaperResult],
    include_overview: bool = True,
    include_clustering: bool = True,
    include_relevance: bool = True,
    timeout_seconds: float = 30.0,
  ) -> Dict[str, Any]:
    """Enhance search results with AI-powered analysis.

    This is the main entry point that combines multiple AI features.
    All AI calls are made in parallel for better performance.

    Args:
        query: Original search query
        papers: List of papers from search results
        include_overview: Generate search overview
        include_clustering: Cluster papers by topic
        include_relevance: Add relevance explanations
        timeout_seconds: Maximum time to wait for AI enhancements

    Returns:
        Dict with all requested enhancements
    """
    import asyncio

    result: Dict[str, Any] = {
      "query": query,
      "paper_count": len(papers),
    }

    # Run AI tasks SEQUENTIALLY to avoid concurrency issues with sync GenAI client
    # The sync client doesn't handle multiple parallel calls well
    logger.info(
      "Starting AI enhancement tasks (sequential)",
      paper_count=len(papers),
      include_overview=include_overview,
      include_clustering=include_clustering,
      include_relevance=include_relevance,
    )

    successful_tasks = []
    failed_tasks = []

    # Query understanding (always included)
    try:
      qu_result = await asyncio.wait_for(
        self.understand_query(query), timeout=timeout_seconds / 4
      )
      if qu_result:
        result["query_understanding"] = qu_result
        successful_tasks.append("query_understanding")
      else:
        failed_tasks.append("query_understanding")
    except asyncio.TimeoutError:
      logger.warning("Query understanding timed out")
      failed_tasks.append("query_understanding")
    except Exception as e:
      logger.error("Query understanding failed", error=str(e))
      failed_tasks.append("query_understanding")

    if papers:
      # Generate overview
      if include_overview:
        try:
          overview_result = await asyncio.wait_for(
            self.generate_search_overview(query, papers), timeout=timeout_seconds / 4
          )
          if overview_result:
            result["overview"] = overview_result
            successful_tasks.append("overview")
          else:
            failed_tasks.append("overview")
        except asyncio.TimeoutError:
          logger.warning("Search overview timed out")
          failed_tasks.append("overview")
        except Exception as e:
          logger.error("Search overview failed", error=str(e))
          failed_tasks.append("overview")

      # Cluster papers
      if include_clustering and len(papers) >= 3:
        try:
          clustering_result = await asyncio.wait_for(
            self.cluster_papers(papers), timeout=timeout_seconds / 4
          )
          if clustering_result:
            result["clustering"] = clustering_result
            successful_tasks.append("clustering")
          else:
            failed_tasks.append("clustering")
        except asyncio.TimeoutError:
          logger.warning("Clustering timed out")
          failed_tasks.append("clustering")
        except Exception as e:
          logger.error("Clustering failed", error=str(e))
          failed_tasks.append("clustering")

      # Add relevance explanations
      if include_relevance:
        try:
          relevance_result = await asyncio.wait_for(
            self.explain_relevance(query, papers), timeout=timeout_seconds / 4
          )
          if relevance_result:
            result["relevance_explanations"] = relevance_result
            successful_tasks.append("relevance")
          else:
            failed_tasks.append("relevance")
        except asyncio.TimeoutError:
          logger.warning("Relevance explanation timed out")
          failed_tasks.append("relevance")
        except Exception as e:
          logger.error("Relevance explanation failed", error=str(e))
          failed_tasks.append("relevance")

    logger.info(
      "AI enhancement completed",
      successful_tasks=successful_tasks,
      failed_tasks=failed_tasks,
      result_keys=list(result.keys()),
    )

    return result

  def _build_papers_summary(self, papers: List[ExternalPaperResult]) -> str:
    """Build a text summary of papers for prompts.

    Args:
        papers: List of papers

    Returns:
        Formatted text summary
    """
    lines = []
    for i, paper in enumerate(papers):
      authors = ", ".join(paper.authors[:3]) if paper.authors else "Unknown"
      if len(paper.authors) > 3:
        authors += " et al."

      year = f" ({paper.year})" if paper.year else ""
      citations = f" [cited: {paper.citation_count}]" if paper.citation_count else ""

      # Truncate abstract
      abstract = paper.abstract or "No abstract"
      if len(abstract) > 200:
        abstract = abstract[:200] + "..."

      lines.append(f"{i + 1}. {paper.title}{year}")
      lines.append(f"   Authors: {authors}{citations}")
      lines.append(f"   {abstract}")
      lines.append("")

    return "\n".join(lines)

  def _build_papers_json(self, papers: List[ExternalPaperResult]) -> str:
    """Build a JSON representation of papers for prompts.

    Args:
        papers: List of papers

    Returns:
        JSON string representation
    """
    import json

    papers_data = []
    for i, paper in enumerate(papers):
      # Truncate abstract for prompt length
      abstract = paper.abstract or ""
      if len(abstract) > 300:
        abstract = abstract[:300] + "..."

      papers_data.append(
        {
          "index": i,
          "title": paper.title,
          "authors": paper.authors[:3] if paper.authors else [],
          "year": paper.year,
          "abstract": abstract,
          "citation_count": paper.citation_count,
        }
      )

    return json.dumps(papers_data, indent=2)


# Global service instance
ai_search_service = AISearchService()
