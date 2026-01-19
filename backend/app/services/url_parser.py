"""URL Parser service for extracting PDF URLs from various academic paper sites."""

import re
from dataclasses import dataclass
from typing import Dict, List, Optional
from urllib.parse import parse_qs, urlparse


@dataclass
class ParsedURL:
  """Result of parsing an academic paper URL."""

  original_url: str
  pdf_url: Optional[str] = None
  doi: Optional[str] = None
  arxiv_id: Optional[str] = None
  site: Optional[str] = None
  headers: Optional[Dict[str, str]] = None
  error: Optional[str] = None


class URLParser:
  """Parse URLs from various academic paper sites and extract PDF download URLs."""

  # Common user agent for requests
  DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  }

  def parse_url(self, url: str) -> ParsedURL:
    """Parse a URL and determine the PDF download URL and metadata.

    Supports:
    - arXiv (arxiv.org)
    - ACM Digital Library (dl.acm.org)
    - OpenReview (openreview.net)
    - PMLR (proceedings.mlr.press)
    - NeurIPS (papers.nips.cc, neurips.cc)
    - Semantic Scholar (semanticscholar.org)
    - IEEE Xplore (ieeexplore.ieee.org) - limited support
    - Direct PDF URLs (*.pdf)
    """
    url = url.strip()

    if not url:
      return ParsedURL(original_url=url, error="Empty URL")

    try:
      parsed = urlparse(url)
      domain = parsed.netloc.lower()

      # Remove www. prefix for matching
      if domain.startswith("www."):
        domain = domain[4:]

      # Direct PDF URL
      if url.lower().endswith(".pdf"):
        return ParsedURL(
          original_url=url,
          pdf_url=url,
          site="direct_pdf",
        )

      # arXiv
      if "arxiv.org" in domain:
        return self._parse_arxiv(url, parsed)

      # ACM Digital Library
      if "dl.acm.org" in domain:
        return self._parse_acm(url, parsed)

      # OpenReview
      if "openreview.net" in domain:
        return self._parse_openreview(url, parsed)

      # PMLR
      if "proceedings.mlr.press" in domain or "mlr.press" in domain:
        return self._parse_pmlr(url, parsed)

      # NeurIPS
      if "papers.nips.cc" in domain or "neurips.cc" in domain:
        return self._parse_neurips(url, parsed)

      # Semantic Scholar
      if "semanticscholar.org" in domain:
        return self._parse_semantic_scholar(url, parsed)

      # IEEE Xplore - limited, often requires subscription
      if "ieeexplore.ieee.org" in domain:
        return self._parse_ieee(url, parsed)

      # MDPI
      if "mdpi.com" in domain:
        return self._parse_mdpi(url, parsed)

      # Nature
      if "nature.com" in domain:
        return self._parse_nature(url, parsed)

      # bioRxiv / medRxiv
      if "biorxiv.org" in domain or "medrxiv.org" in domain:
        return self._parse_biorxiv(url, parsed)

      # Default: try to use the URL as-is
      return ParsedURL(
        original_url=url,
        pdf_url=url,
        site="unknown",
      )

    except Exception as e:
      return ParsedURL(original_url=url, error=str(e))

  def _parse_arxiv(self, url: str, parsed) -> ParsedURL:
    """Parse arXiv URL: arxiv.org/abs/XXXX.XXXXX or arxiv.org/pdf/XXXX.XXXXX"""
    # Extract arXiv ID
    path = parsed.path
    arxiv_match = re.search(r"(?:abs|pdf)/(\d+\.\d+(?:v\d+)?)", path)

    if arxiv_match:
      arxiv_id = arxiv_match.group(1)
      # Convert to PDF URL
      pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
      return ParsedURL(
        original_url=url,
        pdf_url=pdf_url,
        arxiv_id=arxiv_id,
        doi=f"arxiv:{arxiv_id.split('v')[0]}",  # Remove version for DOI
        site="arxiv",
      )

    # Old-style arXiv IDs (e.g., hep-th/9901001)
    old_match = re.search(r"(?:abs|pdf)/([a-z-]+/\d+)", path)
    if old_match:
      arxiv_id = old_match.group(1)
      pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
      return ParsedURL(
        original_url=url,
        pdf_url=pdf_url,
        arxiv_id=arxiv_id,
        site="arxiv",
      )

    return ParsedURL(original_url=url, error="Could not parse arXiv URL", site="arxiv")

  def _parse_acm(self, url: str, parsed) -> ParsedURL:
    """Parse ACM DL URL: dl.acm.org/doi/10.1145/XXXXX"""
    path = parsed.path

    # Extract DOI from path
    doi_match = re.search(r"/doi(?:/(?:abs|pdf|full))?/(10\.\d+/[^?#]+)", path)
    if doi_match:
      doi = doi_match.group(1)
      # ACM PDF URL format
      pdf_url = f"https://dl.acm.org/doi/pdf/{doi}"
      return ParsedURL(
        original_url=url,
        pdf_url=pdf_url,
        doi=doi,
        site="acm",
        headers=self.DEFAULT_HEADERS,
      )

    return ParsedURL(original_url=url, error="Could not parse ACM URL", site="acm")

  def _parse_openreview(self, url: str, parsed) -> ParsedURL:
    """Parse OpenReview URL: openreview.net/forum?id=XXX"""
    query = parse_qs(parsed.query)
    paper_id = query.get("id", [None])[0]

    if paper_id:
      pdf_url = f"https://openreview.net/pdf?id={paper_id}"
      return ParsedURL(
        original_url=url,
        pdf_url=pdf_url,
        site="openreview",
      )

    # Check if already a PDF URL
    if "/pdf" in parsed.path:
      return ParsedURL(
        original_url=url,
        pdf_url=url,
        site="openreview",
      )

    return ParsedURL(
      original_url=url, error="Could not parse OpenReview URL", site="openreview"
    )

  def _parse_pmlr(self, url: str, parsed) -> ParsedURL:
    """Parse PMLR URL: proceedings.mlr.press/vXX/author.html"""
    path = parsed.path

    # Match pattern like /v162/smith22a.html
    match = re.search(r"/(v\d+)/([^/]+)\.html?", path)
    if match:
      volume = match.group(1)
      paper_id = match.group(2)
      pdf_url = f"https://proceedings.mlr.press/{volume}/{paper_id}/{paper_id}.pdf"
      return ParsedURL(
        original_url=url,
        pdf_url=pdf_url,
        site="pmlr",
      )

    # Check if already a PDF URL
    if path.endswith(".pdf"):
      return ParsedURL(original_url=url, pdf_url=url, site="pmlr")

    return ParsedURL(original_url=url, error="Could not parse PMLR URL", site="pmlr")

  def _parse_neurips(self, url: str, parsed) -> ParsedURL:
    """Parse NeurIPS URL: papers.nips.cc/paper/XXXX or neurips.cc/paper_files/paper/XXXX"""
    path = parsed.path

    # papers.nips.cc format
    if "papers.nips.cc" in parsed.netloc:
      # Format: /paper/YEAR/hash-title
      match = re.search(r"/paper/(\d+)/([^/]+)", path)
      if match:
        year = match.group(1)
        paper_id = match.group(2)
        pdf_url = f"https://papers.nips.cc/paper/{year}/file/{paper_id}-Paper.pdf"
        return ParsedURL(original_url=url, pdf_url=pdf_url, site="neurips")

    # neurips.cc format
    if "neurips.cc" in parsed.netloc:
      # Try to find PDF link in path
      if "/paper_files/" in path and path.endswith(".pdf"):
        return ParsedURL(original_url=url, pdf_url=url, site="neurips")

      # Convert abstract to PDF
      match = re.search(r"/paper_files/paper/(\d+)/hash/([^-]+)", path)
      if match:
        year = match.group(1)
        hash_id = match.group(2)
        pdf_url = (
          f"https://neurips.cc/paper_files/paper/{year}/file/{hash_id}-Paper.pdf"
        )
        return ParsedURL(original_url=url, pdf_url=pdf_url, site="neurips")

    return ParsedURL(
      original_url=url, error="Could not parse NeurIPS URL", site="neurips"
    )

  def _parse_semantic_scholar(self, url: str, parsed) -> ParsedURL:
    """Parse Semantic Scholar URL - primarily for metadata, PDF may not be available."""
    # Semantic Scholar doesn't host PDFs directly but links to open access versions
    # We'll return the URL as-is and let the ingestion service handle it
    path = parsed.path
    match = re.search(r"/paper/([^/]+)", path)

    if match:
      return ParsedURL(
        original_url=url,
        pdf_url=None,  # PDF not directly available
        site="semantic_scholar",
        error="Semantic Scholar does not host PDFs directly. Try the source link.",
      )

    return ParsedURL(
      original_url=url,
      error="Could not parse Semantic Scholar URL",
      site="semantic_scholar",
    )

  def _parse_ieee(self, url: str, parsed) -> ParsedURL:
    """Parse IEEE Xplore URL - often requires subscription."""
    path = parsed.path

    # Extract document ID
    match = re.search(r"/document/(\d+)", path)
    if match:
      doc_id = match.group(1)
      # IEEE PDF requires authentication for most papers
      # We can try the stamp URL which sometimes works for open access
      pdf_url = f"https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber={doc_id}"
      return ParsedURL(
        original_url=url,
        pdf_url=pdf_url,
        site="ieee",
        headers=self.DEFAULT_HEADERS,
        error="IEEE may require subscription for full PDF access",
      )

    return ParsedURL(original_url=url, error="Could not parse IEEE URL", site="ieee")

  def _parse_mdpi(self, url: str, parsed) -> ParsedURL:
    """Parse MDPI URL: mdpi.com/XXXX-XXXX/volume/issue/article"""
    path = parsed.path

    # MDPI papers have format: /journal/volume/issue/article
    # PDF URL adds /pdf at the end
    if "/pdf" not in path:
      pdf_url = url.rstrip("/") + "/pdf"
    else:
      pdf_url = url

    return ParsedURL(
      original_url=url,
      pdf_url=pdf_url,
      site="mdpi",
    )

  def _parse_nature(self, url: str, parsed) -> ParsedURL:
    """Parse Nature URL: nature.com/articles/XXXXX"""
    path = parsed.path

    # Extract article ID
    match = re.search(r"/articles/([^/?#]+)", path)
    if match:
      article_id = match.group(1)
      pdf_url = f"https://www.nature.com/articles/{article_id}.pdf"
      return ParsedURL(
        original_url=url,
        pdf_url=pdf_url,
        site="nature",
        headers=self.DEFAULT_HEADERS,
      )

    return ParsedURL(
      original_url=url, error="Could not parse Nature URL", site="nature"
    )

  def _parse_biorxiv(self, url: str, parsed) -> ParsedURL:
    """Parse bioRxiv/medRxiv URL: biorxiv.org/content/10.1101/XXXXX"""
    path = parsed.path

    # Extract DOI from path
    doi_match = re.search(r"/content/(10\.\d+/[^?#/]+)", path)
    if doi_match:
      doi = doi_match.group(1)
      # bioRxiv PDF URL - append .full.pdf
      base_url = url.split("?")[0].rstrip("/")
      if not base_url.endswith(".pdf"):
        pdf_url = base_url + ".full.pdf"
      else:
        pdf_url = url
      return ParsedURL(
        original_url=url,
        pdf_url=pdf_url,
        doi=doi,
        site="biorxiv" if "biorxiv" in parsed.netloc else "medrxiv",
      )

    return ParsedURL(
      original_url=url, error="Could not parse bioRxiv/medRxiv URL", site="biorxiv"
    )

  def extract_urls_from_text(self, text: str) -> List[str]:
    """Extract all URLs from pasted text.

    Handles URLs separated by:
    - Newlines
    - Spaces
    - Commas
    - Tabs
    """
    if not text:
      return []

    # URL pattern - match http/https URLs
    url_pattern = r"https?://[^\s,\"\'\>\<\]\[\)\(]+"

    urls = re.findall(url_pattern, text)

    # Clean up URLs (remove trailing punctuation)
    cleaned_urls = []
    for url in urls:
      # Remove trailing punctuation that might be part of text
      url = url.rstrip(".,;:!?")
      if url:
        cleaned_urls.append(url)

    # Remove duplicates while preserving order
    seen = set()
    unique_urls = []
    for url in cleaned_urls:
      if url not in seen:
        seen.add(url)
        unique_urls.append(url)

    return unique_urls


# Singleton instance
url_parser = URLParser()
