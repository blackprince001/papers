import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse


@dataclass
class ParsedURL:
  original_url: str
  pdf_url: str | None = None
  doi: str | None = None
  arxiv_id: str | None = None
  site: str | None = None
  headers: dict[str, str] | None = None
  error: str | None = None


DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}


class URLParser:
  def parse_url(self, url: str) -> ParsedURL:
    url = url.strip()
    if not url:
      return ParsedURL(original_url=url, error="Empty URL")

    try:
      parsed = urlparse(url)
      domain = parsed.netloc.lower().removeprefix("www.")

      if url.lower().endswith(".pdf"):
        return ParsedURL(original_url=url, pdf_url=url, site="direct_pdf")

      parser = self._get_parser_for_domain(domain)
      if parser:
        return parser(url, parsed)

      return ParsedURL(original_url=url, pdf_url=url, site="unknown")
    except Exception as e:
      return ParsedURL(original_url=url, error=str(e))

  def _get_parser_for_domain(self, domain: str):
    parsers = {
      "arxiv.org": self._parse_arxiv,
      "dl.acm.org": self._parse_acm,
      "openreview.net": self._parse_openreview,
      "proceedings.mlr.press": self._parse_pmlr,
      "mlr.press": self._parse_pmlr,
      "papers.nips.cc": self._parse_neurips,
      "neurips.cc": self._parse_neurips,
      "semanticscholar.org": self._parse_semantic_scholar,
      "ieeexplore.ieee.org": self._parse_ieee,
      "mdpi.com": self._parse_mdpi,
      "nature.com": self._parse_nature,
      "biorxiv.org": self._parse_biorxiv,
      "medrxiv.org": self._parse_biorxiv,
    }

    for key, parser in parsers.items():
      if key in domain:
        return parser
    return None

  def _parse_arxiv(self, url: str, parsed) -> ParsedURL:
    path = parsed.path
    arxiv_match = re.search(r"(?:abs|pdf)/(\d+\.\d+(?:v\d+)?)", path)

    if arxiv_match:
      arxiv_id = arxiv_match.group(1)
      return ParsedURL(
        original_url=url,
        pdf_url=f"https://arxiv.org/pdf/{arxiv_id}.pdf",
        arxiv_id=arxiv_id,
        doi=f"arxiv:{arxiv_id.split('v')[0]}",
        site="arxiv",
      )

    old_match = re.search(r"(?:abs|pdf)/([a-z-]+/\d+)", path)
    if old_match:
      arxiv_id = old_match.group(1)
      return ParsedURL(
        original_url=url,
        pdf_url=f"https://arxiv.org/pdf/{arxiv_id}.pdf",
        arxiv_id=arxiv_id,
        site="arxiv",
      )

    return ParsedURL(original_url=url, error="Could not parse arXiv URL", site="arxiv")

  def _parse_acm(self, url: str, parsed) -> ParsedURL:
    doi_match = re.search(r"/doi(?:/(?:abs|pdf|full))?/(10\.\d+/[^?#]+)", parsed.path)
    if doi_match:
      doi = doi_match.group(1)
      return ParsedURL(
        original_url=url,
        pdf_url=f"https://dl.acm.org/doi/pdf/{doi}",
        doi=doi,
        site="acm",
        headers=DEFAULT_HEADERS,
      )
    return ParsedURL(original_url=url, error="Could not parse ACM URL", site="acm")

  def _parse_openreview(self, url: str, parsed) -> ParsedURL:
    query = parse_qs(parsed.query)
    paper_id = query.get("id", [None])[0]

    if paper_id:
      return ParsedURL(
        original_url=url,
        pdf_url=f"https://openreview.net/pdf?id={paper_id}",
        site="openreview",
      )

    if "/pdf" in parsed.path:
      return ParsedURL(original_url=url, pdf_url=url, site="openreview")

    return ParsedURL(
      original_url=url, error="Could not parse OpenReview URL", site="openreview"
    )

  def _parse_pmlr(self, url: str, parsed) -> ParsedURL:
    path = parsed.path
    match = re.search(r"/(v\d+)/([^/]+)\.html?", path)

    if match:
      volume = match.group(1)
      paper_id = match.group(2)
      return ParsedURL(
        original_url=url,
        pdf_url=f"https://proceedings.mlr.press/{volume}/{paper_id}/{paper_id}.pdf",
        site="pmlr",
      )

    if path.endswith(".pdf"):
      return ParsedURL(original_url=url, pdf_url=url, site="pmlr")

    return ParsedURL(original_url=url, error="Could not parse PMLR URL", site="pmlr")

  def _parse_neurips(self, url: str, parsed) -> ParsedURL:
    path = parsed.path

    if "papers.nips.cc" in parsed.netloc:
      match = re.search(r"/paper/(\d+)/([^/]+)", path)
      if match:
        year = match.group(1)
        paper_id = match.group(2)
        return ParsedURL(
          original_url=url,
          pdf_url=f"https://papers.nips.cc/paper/{year}/file/{paper_id}-Paper.pdf",
          site="neurips",
        )

    if "neurips.cc" in parsed.netloc:
      if "/paper_files/" in path and path.endswith(".pdf"):
        return ParsedURL(original_url=url, pdf_url=url, site="neurips")

      match = re.search(r"/paper_files/paper/(\d+)/hash/([^-]+)", path)
      if match:
        year = match.group(1)
        hash_id = match.group(2)
        return ParsedURL(
          original_url=url,
          pdf_url=f"https://neurips.cc/paper_files/paper/{year}/file/{hash_id}-Paper.pdf",
          site="neurips",
        )

    return ParsedURL(
      original_url=url, error="Could not parse NeurIPS URL", site="neurips"
    )

  def _parse_semantic_scholar(self, url: str, parsed) -> ParsedURL:
    match = re.search(r"/paper/([^/]+)", parsed.path)
    if match:
      return ParsedURL(
        original_url=url,
        pdf_url=None,
        site="semantic_scholar",
        error="Semantic Scholar does not host PDFs directly. Try the source link.",
      )
    return ParsedURL(
      original_url=url,
      error="Could not parse Semantic Scholar URL",
      site="semantic_scholar",
    )

  def _parse_ieee(self, url: str, parsed) -> ParsedURL:
    match = re.search(r"/document/(\d+)", parsed.path)
    if match:
      doc_id = match.group(1)
      return ParsedURL(
        original_url=url,
        pdf_url=f"https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber={doc_id}",
        site="ieee",
        headers=DEFAULT_HEADERS,
        error="IEEE may require subscription for full PDF access",
      )
    return ParsedURL(original_url=url, error="Could not parse IEEE URL", site="ieee")

  def _parse_mdpi(self, url: str, parsed) -> ParsedURL:
    path = parsed.path
    if "/pdf" not in path:
      pdf_url = url.rstrip("/") + "/pdf"
    else:
      pdf_url = url
    return ParsedURL(original_url=url, pdf_url=pdf_url, site="mdpi")

  def _parse_nature(self, url: str, parsed) -> ParsedURL:
    match = re.search(r"/articles/([^/?#]+)", parsed.path)
    if match:
      article_id = match.group(1)
      return ParsedURL(
        original_url=url,
        pdf_url=f"https://www.nature.com/articles/{article_id}.pdf",
        site="nature",
        headers=DEFAULT_HEADERS,
      )
    return ParsedURL(
      original_url=url, error="Could not parse Nature URL", site="nature"
    )

  def _parse_biorxiv(self, url: str, parsed) -> ParsedURL:
    doi_match = re.search(r"/content/(10\.\d+/[^?#/]+)", parsed.path)
    if doi_match:
      doi = doi_match.group(1)
      base_url = url.split("?")[0].rstrip("/")
      pdf_url = base_url if base_url.endswith(".pdf") else base_url + ".full.pdf"
      site = "biorxiv" if "biorxiv" in parsed.netloc else "medrxiv"
      return ParsedURL(original_url=url, pdf_url=pdf_url, doi=doi, site=site)
    return ParsedURL(
      original_url=url, error="Could not parse bioRxiv/medRxiv URL", site="biorxiv"
    )

  def extract_urls_from_text(self, text: str) -> list[str]:
    if not text:
      return []

    url_pattern = r"https?://[^\s,\"\'\>\<\]\[\)\(]+"
    urls = re.findall(url_pattern, text)

    cleaned_urls = [url.rstrip(".,;:!?") for url in urls if url.rstrip(".,;:!?")]

    seen = set()
    unique_urls = []
    for url in cleaned_urls:
      if url not in seen:
        seen.add(url)
        unique_urls.append(url)

    return unique_urls


url_parser = URLParser()
