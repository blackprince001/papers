from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class DiscoverySearchFilters(BaseModel):
  """Filters for discovery search."""

  year_from: Optional[int] = Field(None, description="Minimum publication year")
  year_to: Optional[int] = Field(None, description="Maximum publication year")
  authors: Optional[List[str]] = Field(None, description="Filter by author names")
  min_citations: Optional[int] = Field(None, description="Minimum citation count")


class DiscoverySearchRequest(BaseModel):
  """Request for multi-source discovery search."""

  query: str = Field(..., min_length=1, description="Search query")
  sources: List[str] = Field(
    default=["arxiv", "semantic_scholar"],
    description="Data sources to search",
  )
  filters: Optional[DiscoverySearchFilters] = None
  limit: int = Field(default=20, ge=1, le=100, description="Results per source")
  include_embeddings: bool = Field(
    default=False, description="Generate embeddings for results"
  )


class DiscoveredPaperBase(BaseModel):
  """Base schema for discovered papers."""

  source: str
  external_id: str
  title: str
  authors: List[str] = []
  abstract: Optional[str] = None
  year: Optional[int] = None
  doi: Optional[str] = None
  arxiv_id: Optional[str] = None
  url: Optional[str] = None
  pdf_url: Optional[str] = None
  citation_count: Optional[int] = None
  metadata_json: Dict[str, Any] = {}


class DiscoveredPaper(DiscoveredPaperBase):
  """Full discovered paper schema."""

  id: int
  discovered_at: datetime
  last_fetched_at: datetime
  similarity_score: Optional[float] = None  # For semantic search results

  class Config:
    from_attributes = True


class DiscoveredPaperPreview(BaseModel):
  """Lightweight preview for search results."""

  source: str
  external_id: str
  title: str
  authors: List[str] = []
  abstract: Optional[str] = None
  year: Optional[int] = None
  doi: Optional[str] = None
  url: Optional[str] = None
  pdf_url: Optional[str] = None
  citation_count: Optional[int] = None
  relevance_score: Optional[float] = None

  class Config:
    from_attributes = True


class SourceSearchResult(BaseModel):
  """Results from a single source."""

  source: str
  papers: List[DiscoveredPaperPreview]
  total_available: Optional[int] = None
  error: Optional[str] = None


class DiscoverySearchResponse(BaseModel):
  """Combined search response from all sources."""

  query: str
  sources_searched: List[str]
  results: List[SourceSearchResult]
  total_results: int
  deduplicated_count: int = 0


class AddToLibraryRequest(BaseModel):
  """Request to add a discovered paper to the library."""

  discovered_paper_id: int
  group_ids: Optional[List[int]] = None
  tag_ids: Optional[List[int]] = None


class AddToLibraryResponse(BaseModel):
  """Response after adding paper to library."""

  paper_id: int
  title: str
  message: str


class BatchAddToLibraryRequest(BaseModel):
  """Request to add multiple discovered papers to the library."""

  discovered_paper_ids: List[int]
  group_ids: Optional[List[int]] = None
  tag_ids: Optional[List[int]] = None


class BatchAddToLibraryResponse(BaseModel):
  """Response after batch adding papers to library."""

  added: List[AddToLibraryResponse]
  errors: List[Dict[str, Any]] = []


class ResearchTopicBase(BaseModel):
  """Base schema for research topics."""

  name: str
  description: Optional[str] = None
  keywords: List[str] = []


class ResearchTopic(ResearchTopicBase):
  """Full research topic schema."""

  id: int
  created_at: datetime

  class Config:
    from_attributes = True


class TopicCluster(BaseModel):
  """A cluster of papers grouped by topic."""

  topic: ResearchTopic
  papers: List[DiscoveredPaperPreview]
  paper_count: int


class ClusterSearchResultsRequest(BaseModel):
  """Request to cluster search results by topic."""

  paper_ids: List[int] = Field(..., description="IDs of discovered papers to cluster")
  num_clusters: int = Field(default=5, ge=2, le=10, description="Number of clusters")


class ClusterSearchResultsResponse(BaseModel):
  """Response with clustered search results."""

  clusters: List[TopicCluster]
  unclustered: List[DiscoveredPaperPreview] = []


class DiscoverySessionCreate(BaseModel):
  """Request to create a discovery session."""

  name: Optional[str] = None
  query: str
  sources: List[str] = []
  filters_json: Dict[str, Any] = {}


class DiscoverySession(BaseModel):
  """Full discovery session schema."""

  id: int
  name: Optional[str] = None
  query: str
  sources: List[str] = []
  filters_json: Dict[str, Any] = {}
  created_at: datetime
  updated_at: datetime
  paper_count: int = 0

  class Config:
    from_attributes = True


class DiscoverySessionDetail(DiscoverySession):
  """Discovery session with papers."""

  papers: List[DiscoveredPaperPreview] = []


class RecommendationRequest(BaseModel):
  """Request for paper recommendations."""

  based_on: str = Field(
    default="library",
    description="What to base recommendations on: 'library', 'paper', or 'group'",
  )
  paper_id: Optional[int] = Field(None, description="Paper ID if based_on='paper'")
  group_id: Optional[int] = Field(None, description="Group ID if based_on='group'")
  sources: List[str] = Field(
    default=["semantic_scholar"],
    description="Sources to get recommendations from",
  )
  limit: int = Field(default=10, ge=1, le=50)


class RecommendationResponse(BaseModel):
  """Response with recommended papers."""

  based_on: str
  recommendations: List[DiscoveredPaperPreview]
  total: int


class CitationExplorerRequest(BaseModel):
  """Request for citation exploration."""

  source: str
  external_id: str
  direction: str = Field(
    default="both",
    description="Direction: 'citations' (papers citing this), 'references' (papers this cites), or 'both'",
  )
  limit: int = Field(default=10, ge=1, le=50)


class CitationExplorerResponse(BaseModel):
  """Response with citation network."""

  paper: DiscoveredPaperPreview
  citations: List[DiscoveredPaperPreview] = []
  references: List[DiscoveredPaperPreview] = []
  citations_count: int = 0
  references_count: int = 0


class DiscoverySourceInfo(BaseModel):
  """Information about a discovery source."""

  name: str
  display_name: str
  description: str
  supports_search: bool = True
  supports_citations: bool = False
  supports_recommendations: bool = False
  rate_limit: Optional[str] = None


class DiscoverySourcesResponse(BaseModel):
  """List of available discovery sources."""

  sources: List[DiscoverySourceInfo]


# AI Search Schemas


class QueryUnderstanding(BaseModel):
  """AI-generated query understanding."""

  interpreted_query: str = Field(..., description="Clear interpretation of the query")
  key_concepts: List[str] = Field(default=[], description="Core concepts/topics")
  search_terms: List[str] = Field(default=[], description="Specific search terms")
  domain_hints: List[str] = Field(default=[], description="Research fields/domains")
  query_type: str = Field(
    default="exploratory",
    description="Query type: exploratory, specific, comparative, methodological",
  )


class SearchOverview(BaseModel):
  """AI-generated overview of search results."""

  overview: str = Field(..., description="Summary of the research landscape")
  key_themes: List[str] = Field(default=[], description="Major themes in results")
  notable_trends: List[str] = Field(default=[], description="Emerging patterns")
  research_gaps: List[str] = Field(default=[], description="Underexplored areas")
  suggested_followups: List[str] = Field(
    default=[], description="Related queries to explore"
  )


class PaperCluster(BaseModel):
  """A cluster of papers grouped by topic."""

  name: str = Field(..., description="Cluster name")
  description: str = Field(default="", description="Cluster description")
  keywords: List[str] = Field(default=[], description="Cluster keywords")
  paper_indices: List[int] = Field(default=[], description="Indices of papers in cluster")


class ClusteringResult(BaseModel):
  """AI-generated clustering of papers."""

  clusters: List[PaperCluster] = Field(default=[], description="Paper clusters")
  unclustered_indices: List[int] = Field(
    default=[], description="Indices of papers not in any cluster"
  )


class PaperRelevanceExplanation(BaseModel):
  """AI-generated relevance explanation for a paper."""

  paper_index: int
  relevance: str = Field(..., description="Why this paper is relevant")
  key_contribution: str = Field(default="", description="Main contribution")
  relevance_score: float = Field(
    default=0.5, ge=0.0, le=1.0, description="Relevance score 0-1"
  )


class RelevanceExplanations(BaseModel):
  """AI-generated relevance explanations for papers."""

  explanations: List[PaperRelevanceExplanation] = Field(default=[])


class AISearchRequest(BaseModel):
  """Request for AI-enhanced discovery search."""

  query: str = Field(..., min_length=1, description="Natural language search query")
  sources: List[str] = Field(
    default=["arxiv", "semantic_scholar"],
    description="Data sources to search",
  )
  filters: Optional[DiscoverySearchFilters] = None
  limit: int = Field(default=20, ge=1, le=100, description="Results per source")
  include_overview: bool = Field(default=True, description="Generate AI overview")
  include_clustering: bool = Field(default=True, description="Cluster results by topic")
  include_relevance: bool = Field(
    default=True, description="Add relevance explanations"
  )


class AISearchResponse(BaseModel):
  """Response from AI-enhanced discovery search."""

  query: str
  query_understanding: Optional[QueryUnderstanding] = None
  sources_searched: List[str]
  results: List[SourceSearchResult]
  total_results: int
  deduplicated_count: int = 0
  overview: Optional[SearchOverview] = None
  clustering: Optional[ClusteringResult] = None
  relevance_explanations: Optional[RelevanceExplanations] = None
