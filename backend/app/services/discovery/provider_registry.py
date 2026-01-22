from typing import Dict, List, Optional, Type

from app.core.logger import get_logger
from app.services.discovery.base_provider import BaseDiscoveryProvider

logger = get_logger(__name__)


class ProviderRegistry:
  """Registry for discovery providers."""

  def __init__(self) -> None:
    self._providers: Dict[str, BaseDiscoveryProvider] = {}
    self._provider_classes: Dict[str, Type[BaseDiscoveryProvider]] = {}

  def register(
    self,
    provider_class: Type[BaseDiscoveryProvider],
    api_key: Optional[str] = None,
  ) -> None:
    """Register a provider class and instantiate it.

    Args:
        provider_class: Provider class to register
        api_key: Optional API key for the provider
    """
    provider = provider_class(api_key=api_key)
    self._providers[provider.name] = provider
    self._provider_classes[provider.name] = provider_class
    logger.info("Registered discovery provider", provider=provider.name)

  def get(self, name: str) -> Optional[BaseDiscoveryProvider]:
    """Get a provider by name.

    Args:
        name: Provider name

    Returns:
        Provider instance or None
    """
    return self._providers.get(name)

  def get_all(self) -> List[BaseDiscoveryProvider]:
    """Get all registered providers.

    Returns:
        List of all providers
    """
    return list(self._providers.values())

  def get_by_names(self, names: List[str]) -> List[BaseDiscoveryProvider]:
    """Get providers by names.

    Args:
        names: List of provider names

    Returns:
        List of matching providers
    """
    providers = []
    for name in names:
      provider = self._providers.get(name)
      if provider:
        providers.append(provider)
      else:
        logger.warning("Unknown provider requested", provider=name)
    return providers

  def list_names(self) -> List[str]:
    """Get list of registered provider names.

    Returns:
        List of provider names
    """
    return list(self._providers.keys())

  def get_source_infos(self) -> List[Dict]:
    """Get information about all registered sources.

    Returns:
        List of source info dicts
    """
    return [p.get_source_info() for p in self._providers.values()]

  async def close_all(self) -> None:
    """Close all provider HTTP clients."""
    for provider in self._providers.values():
      await provider.close()


# Global registry instance
provider_registry = ProviderRegistry()
