"""AI-powered search enhancements using the configured AI provider."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger import get_logger
from app.services.ai.helpers import get_provider_for_user
from app.services.ai.providers.base import AIProvider, GenerateConfig
from app.services.discovery.base_provider import ExternalPaperResult
from app.utils.json_extractor import extract_json_from_text

logger = get_logger(__name__)

# Force providers that support it (OpenAI-compatible) to return strict JSON.
# Every prompt below already contains the literal word "JSON" and a schema,
# which OpenAI-style json_object mode requires.
JSON_RESPONSE_FORMAT = {"type": "json_object"}


class QueryUnderstandingResponse(BaseModel):
  interpreted_query: str
  boolean_query: str = Field(default="")
  key_concepts: List[str] = Field(default_factory=list)
  search_terms: List[str] = Field(default_factory=list)
  domain_hints: List[str] = Field(default_factory=list)
  query_type: str = "exploratory"


class SearchOverviewResponse(BaseModel):
  overview: str
  key_themes: List[str] = Field(default_factory=list)
  notable_trends: List[str] = Field(default_factory=list)
  research_gaps: List[str] = Field(default_factory=list)
  suggested_followups: List[str] = Field(default_factory=list)


class ClusterResponse(BaseModel):
  name: str
  description: str = ""
  keywords: List[str] = Field(default_factory=list)
  paper_indices: List[int] = Field(default_factory=list)


class ClusteringResponse(BaseModel):
  clusters: List[ClusterResponse] = Field(default_factory=list)
  unclustered_indices: List[int] = Field(default_factory=list)


class RelevanceExplanationItem(BaseModel):
  paper_index: int
  relevance: str
  key_contribution: str = ""
  relevance_score: float = Field(default=0.5, ge=0.0, le=1.0)


class RelevanceResponse(BaseModel):
  explanations: List[RelevanceExplanationItem] = Field(default_factory=list)


QUERY_UNDERSTANDING_PROMPT = """Analyze this research query and extract search intent.
CRITICAL: Generate a 'boolean_query' optimized for academic search engines (arXiv, etc.).

Query: {query}

Return a JSON object with:
{{
  "interpreted_query": "Clear interpretation of what the user is looking for",
  "boolean_query": "Boolean logic query (AND, OR, parentheses) e.g., '(\"deep learning\" OR \"neural networks\") AND optimization'",
  "key_concepts": ["concept1", "concept2", ...],
  "search_terms": ["term1", "term2", ...],
  "domain_hints": ["field1", "field2", ...],
  "query_type": "exploratory" | "specific" | "comparative" | "methodological"
}}

Guidelines:
- interpreted_query: Rephrase in clear academic terms
- boolean_query: MUST use standard boolean operators (AND, OR) and quotes for phrases
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


RECOMMENDATIONS_OVERVIEW_PROMPT = """Analyze these personalized paper recommendations for a researcher.

The user's library focuses on certain research areas, and these papers were recommended as relevant to their interests.

Papers recommended ({paper_count} total):
{papers_summary}

Return a JSON object with:
{{
  "summary": "2-3 paragraph summary explaining what these recommendations reveal about the user's research area",
  "research_themes": ["theme1", "theme2", ...],
  "reading_suggestions": ["suggestion1", "suggestion2", ...],
  "connections": ["connection1", "connection2", ...],
  "emerging_areas": ["area1", "area2", ...]
}}
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
      "relevance": "Brief explanation in 1-2 sentences",
      "key_contribution": "Main contribution or finding",
      "relevance_score": 0.0-1.0
    }},
    ...
  ]
}}

Guidelines:
- Focus on how each paper addresses the query
- Highlight unique contributions
- Score should reflect actual relevance (0.8+ = highly relevant, 0.5-0.8 = moderately, <0.5 = tangentially related)
"""


class AISearchService:
  """Service for AI-powered search enhancements."""

  async def _get_provider(
    self,
    db_session: AsyncSession | None = None,
    user_id: int | None = None,
    preferred_provider_id: int | None = None,
  ) -> AIProvider | None:
    return await get_provider_for_user(db_session, user_id, preferred_provider_id)

  def _build_config(
    self,
    provider: AIProvider,
    system_instruction: str | None = None,
    temperature: float = 0.7,
    max_output_tokens: int | None = None,
    response_format: dict[str, Any] | None = None,
  ) -> GenerateConfig:
    return GenerateConfig(
      model=provider.config.model or "",
      system_instruction=system_instruction,
      temperature=temperature,
      max_output_tokens=max_output_tokens,
      response_format=response_format,
    )

  async def _generate_with_validation(
    self,
    prompt: str,
    context: str,
    provider: "AIProvider | None" = None,
  ) -> Optional[str]:
    """Generate text using the provider and extract the response."""
    provider = provider or await self._get_provider()
    if not provider:
      logger.warning("No AI provider available for %s", context)
      return None

    try:
      config = self._build_config(provider, temperature=0.3)
      response_text = await provider.generate(prompt, config)
      return response_text
    except Exception as e:
      logger.error(
        "Error in %s",
        context,
        error=str(e),
        error_type=type(e).__name__,
      )
      return None

  async def understand_query(
    self, query: str, provider: "AIProvider | None" = None
  ) -> Optional[Dict[str, Any]]:
    """Analyze a natural language query to extract search intent."""
    provider = provider or await self._get_provider()
    if not provider:
      logger.warning("No AI provider available for query understanding")
      return None

    prompt = QUERY_UNDERSTANDING_PROMPT.format(query=query)

    try:
      logger.debug("Calling AI for query understanding", query=query[:100])
      config = self._build_config(
        provider,
        temperature=0.3,
        max_output_tokens=4096,
        response_format=JSON_RESPONSE_FORMAT,
      )
      text = await provider.generate(prompt, config)

      if not text:
        logger.warning("Query understanding returned empty response")
        return None

      result = extract_json_from_text(text)
      if not isinstance(result, dict):
        logger.warning(
          "Query understanding returned non-dict",
          result_type=type(result).__name__,
        )
        return None

      try:
        validated = QueryUnderstandingResponse(**result)
        return validated.model_dump()
      except ValidationError as ve:
        logger.warning(
          "Query understanding response validation failed",
          validation_errors=str(ve),
        )
        if "interpreted_query" in result:
          return result
        return None

    except Exception as e:
      logger.error(
        "Error in query understanding",
        error=str(e),
        error_type=type(e).__name__,
      )
      return None

  async def generate_search_overview(
    self,
    query: str,
    papers: List[ExternalPaperResult],
    provider: "AIProvider | None" = None,
  ) -> Optional[Dict[str, Any]]:
    """Generate an overview/summary of search results."""
    if not papers:
      return None

    provider = provider or await self._get_provider()
    if not provider:
      logger.warning("No AI provider available for search overview")
      return None

    papers_summary = self._build_papers_summary(papers[:50])

    prompt = SEARCH_OVERVIEW_PROMPT.format(
      query=query,
      paper_count=len(papers),
      papers_summary=papers_summary,
    )

    try:
      logger.debug("Calling AI for search overview", paper_count=len(papers))
      config = self._build_config(
        provider,
        temperature=0.3,
        max_output_tokens=16384,
        response_format=JSON_RESPONSE_FORMAT,
      )
      text = await provider.generate(prompt, config)

      if not text:
        return None

      result = extract_json_from_text(text)
      if not isinstance(result, dict):
        return None

      try:
        validated = SearchOverviewResponse(**result)
        return validated.model_dump()
      except ValidationError as ve:
        logger.warning("Search overview validation failed", validation_errors=str(ve))
        if "overview" in result:
          return result
        return None

    except Exception as e:
      logger.error("Error in search overview", error=str(e))
      return None

  async def cluster_papers(
    self,
    papers: List[ExternalPaperResult],
    provider: "AIProvider | None" = None,
  ) -> Optional[Dict[str, Any]]:
    """Cluster papers by topic using AI."""
    if not papers or len(papers) < 3:
      return None

    provider = provider or await self._get_provider()
    if not provider:
      logger.warning("No AI provider available for clustering")
      return None

    papers_json = self._build_papers_json(papers[:50])
    prompt = TOPIC_CLUSTERING_PROMPT.format(papers_json=papers_json)

    try:
      logger.debug("Calling AI for clustering", paper_count=len(papers))
      config = self._build_config(
        provider,
        temperature=0.3,
        max_output_tokens=16384,
        response_format=JSON_RESPONSE_FORMAT,
      )
      text = await provider.generate(prompt, config)

      if not text:
        return None

      result = extract_json_from_text(text)
      if not isinstance(result, dict):
        return None

      try:
        validated = ClusteringResponse(**result)
        return validated.model_dump()
      except ValidationError as ve:
        logger.warning("Clustering validation failed", validation_errors=str(ve))
        if "clusters" in result:
          return result
        return None

    except Exception as e:
      logger.error("Error in clustering", error=str(e))
      return None

  async def explain_relevance(
    self,
    query: str,
    papers: List[ExternalPaperResult],
    provider: "AIProvider | None" = None,
  ) -> Optional[Dict[str, Any]]:
    """Generate relevance explanations for each paper."""
    if not papers:
      return None

    provider = provider or await self._get_provider()
    if not provider:
      logger.warning("No AI provider available for relevance explanation")
      return None

    papers_json = self._build_papers_json(papers[:50])
    prompt = RELEVANCE_EXPLANATION_PROMPT.format(query=query, papers_json=papers_json)

    try:
      logger.debug("Calling AI for relevance explanation", paper_count=len(papers))
      config = self._build_config(
        provider,
        temperature=0.3,
        max_output_tokens=16384,
        response_format=JSON_RESPONSE_FORMAT,
      )
      text = await provider.generate(prompt, config)

      if not text:
        return None

      result = extract_json_from_text(text)
      if not isinstance(result, dict):
        return None

      try:
        validated = RelevanceResponse(**result)
        return validated.model_dump()
      except ValidationError as ve:
        logger.warning("Relevance validation failed", validation_errors=str(ve))
        if "explanations" in result:
          return result
        return None

    except Exception as e:
      logger.error("Error in relevance explanation", error=str(e))
      return None

  async def enhance_search_results(
    self,
    query: str,
    papers: List[ExternalPaperResult],
    include_overview: bool = True,
    include_clustering: bool = True,
    include_relevance: bool = True,
    timeout_seconds: float = 30.0,
    provider: "AIProvider | None" = None,
  ) -> Dict[str, Any]:
    """Enhance search results with AI-powered analysis."""
    import asyncio

    result: Dict[str, Any] = {
      "query": query,
      "paper_count": len(papers),
    }

    logger.info(
      "Starting AI enhancement tasks",
      paper_count=len(papers),
    )

    successful_tasks = []
    failed_tasks = []

    try:
      qu_result = await asyncio.wait_for(
        self.understand_query(query, provider=provider), timeout=timeout_seconds / 4
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
      if include_overview:
        try:
          overview_result = await asyncio.wait_for(
            self.generate_search_overview(query, papers, provider=provider),
            timeout=timeout_seconds / 4,
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

      if include_clustering and len(papers) >= 3:
        try:
          clustering_result = await asyncio.wait_for(
            self.cluster_papers(papers, provider=provider), timeout=timeout_seconds / 4
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

      if include_relevance:
        try:
          relevance_result = await asyncio.wait_for(
            self.explain_relevance(query, papers, provider=provider),
            timeout=timeout_seconds / 4,
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
    )

    return result

  def _build_papers_summary(self, papers: List[ExternalPaperResult]) -> str:
    lines = []
    for i, paper in enumerate(papers):
      authors = ", ".join(paper.authors[:3]) if paper.authors else "Unknown"
      if len(paper.authors) > 3:
        authors += " et al."
      year = f" ({paper.year})" if paper.year else ""
      citations = f" [cited: {paper.citation_count}]" if paper.citation_count else ""
      abstract = paper.abstract or "No abstract"
      if len(abstract) > 2000:
        abstract = abstract[:2000] + "..."
      lines.append(f"{i + 1}. {paper.title}{year}")
      lines.append(f"   Authors: {authors}{citations}")
      lines.append(f"   {abstract}")
      lines.append("")
    return "\n".join(lines)

  def _build_papers_json(self, papers: List[ExternalPaperResult]) -> str:
    import json

    papers_data = []
    for i, paper in enumerate(papers):
      abstract = paper.abstract or ""
      if len(abstract) > 2000:
        abstract = abstract[:2000] + "..."
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


ai_search_service = AISearchService()
