from app.services.discovery.base_provider import (
    BaseDiscoveryProvider,
    ExternalPaperResult,
    SearchFilters,
)
from app.services.discovery.provider_registry import provider_registry
from app.services.discovery.discovery_service import discovery_service
from app.services.discovery.arxiv_provider import ArxivProvider
from app.services.discovery.semantic_scholar_provider import SemanticScholarProvider

__all__ = [
    "ArxivProvider",
    "BaseDiscoveryProvider",
    "ExternalPaperResult",
    "SearchFilters",
    "SemanticScholarProvider",
    "discovery_service",
    "provider_registry",
]
