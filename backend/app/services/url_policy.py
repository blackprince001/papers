"""Outbound URL policy for user-supplied paper downloads."""

from __future__ import annotations

import asyncio
import http.client
import ipaddress
import socket
import ssl
from urllib.parse import urlparse

URL_POLICY_ERROR = "URL target is not allowed"
_ALLOWED_SCHEMES = {"http", "https"}
_BLOCKED_HOSTNAMES = {
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
}


def _blocked_ip(value: str) -> bool:
  address = ipaddress.ip_address(value)
  if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
    address = address.ipv4_mapped
  return any(
    (
      address.is_private,
      address.is_loopback,
      address.is_link_local,
      address.is_reserved,
      address.is_multicast,
      address.is_unspecified,
    )
  )


def _resolve(hostname: str, port: int) -> list[str]:
  try:
    infos = socket.getaddrinfo(
      hostname,
      port,
      type=socket.SOCK_STREAM,
    )
  except OSError as exc:
    raise ValueError(URL_POLICY_ERROR) from exc
  addresses = sorted({info[4][0] for info in infos if info[4]})
  try:
    blocked = any(_blocked_ip(address) for address in addresses)
  except ValueError as exc:
    raise ValueError(URL_POLICY_ERROR) from exc
  if not addresses or blocked:
    raise ValueError(URL_POLICY_ERROR)
  return addresses


async def validate_public_url(url: str) -> list[str]:
  """Reject non-web, credential-bearing, local, and private destinations."""
  try:
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower().rstrip(".")
  except ValueError as exc:
    raise ValueError(URL_POLICY_ERROR) from exc
  if (
    parsed.scheme.lower() not in _ALLOWED_SCHEMES
    or not hostname
    or parsed.username is not None
    or parsed.password is not None
    or hostname in _BLOCKED_HOSTNAMES
    or hostname.endswith(".localhost")
    or hostname.endswith(".internal")
  ):
    raise ValueError(URL_POLICY_ERROR)

  try:
    port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
  except ValueError as exc:
    raise ValueError(URL_POLICY_ERROR) from exc
  return await asyncio.to_thread(_resolve, hostname, port)


def fetch_pinned_url(
  url: str,
  addresses: list[str],
  headers: dict[str, str],
  max_bytes: int,
) -> tuple[int, dict[str, str], bytes]:
  """Fetch one URL while connecting to the already-validated IP address."""
  parsed = urlparse(url)
  hostname = parsed.hostname or ""
  port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
  target = parsed.path or "/"
  if parsed.query:
    target += f"?{parsed.query}"
  ip_address = addresses[0]
  if parsed.scheme.lower() == "https":
    context = ssl.create_default_context()
    connection = _PinnedHTTPSConnection(hostname, ip_address, port, context=context, timeout=60)
  else:
    connection = _PinnedHTTPConnection(hostname, ip_address, port, timeout=60)
  try:
    connection.request("GET", target, headers=headers)
    response = connection.getresponse()
    body = bytearray()
    while True:
      chunk = response.read(min(64 * 1024, max_bytes + 1 - len(body)))
      if not chunk:
        break
      body.extend(chunk)
      if len(body) > max_bytes:
        break
    return response.status, dict(response.getheaders()), bytes(body)
  finally:
    connection.close()


class _PinnedHTTPConnection(http.client.HTTPConnection):
  def __init__(self, hostname: str, address: str, port: int, **kwargs):
    super().__init__(hostname, port, **kwargs)
    self._address = address

  def connect(self):
    self.sock = socket.create_connection((self._address, self.port), self.timeout)
    if self._tunnel_host:
      self._tunnel()


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
  def __init__(self, hostname: str, address: str, port: int, **kwargs):
    super().__init__(hostname, port, **kwargs)
    self._address = address

  def connect(self):
    self.sock = socket.create_connection((self._address, self.port), self.timeout)
    if self._tunnel_host:
      self._tunnel()
    self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)
