import re
from datetime import datetime

from app.models.paper import Paper


def _escape_bibtex(text: str) -> str:
  """Escape special characters for BibTeX, converting accented chars to LaTeX commands."""
  replacements = {
    "ä": '\\"{a}',
    "ö": '\\"{o}',
    "ü": '\\"{u}',
    "Ä": '\\"{A}',
    "Ö": '\\"{O}',
    "Ü": '\\"{U}',
    "ß": "\\ss{}",
    "é": "\\'{e}",
    "è": "\\`{e}",
    "ê": "\\^{e}",
    "ë": '\\"{e}',
    "á": "\\'{a}",
    "à": "\\`{a}",
    "â": "\\^{a}",
    "ã": "\\~{a}",
    "å": "\\aa{}",
    "ç": "\\c{c}",
    "í": "\\'{i}",
    "ì": "\\`{i}",
    "î": "\\^{i}",
    "ï": '\\"{i}',
    "ó": "\\'{o}",
    "ò": "\\`{o}",
    "ô": "\\^{o}",
    "õ": "\\~{o}",
    "ú": "\\'{u}",
    "ù": "\\`{u}",
    "û": "\\^{u}",
    "ý": "\\'{y}",
    "ñ": "\\~{n}",
    "ø": "\\o{}",
    "Æ": "\\AE{}",
    "œ": "\\oe{}",
    "ı": "\\i{}",
    "ł": "\\l{}",
    "ń": "\\'{n}",
    "š": "\\v{s}",
    "č": "\\v{c}",
    "ř": "\\v{r}",
    "ž": "\\v{z}",
    "ğ": "\\u{g}",
    "İ": "\\.{I}",
    "Ş": "\\c{S}",
    "ş": "\\c{s}",
    "–": "--",
    "—": "---",
  }
  for char, latex in replacements.items():
    text = text.replace(char, latex)
  # Escape $, &, %, #, _, ~, ^ (braces are part of LaTeX command syntax)
  text = re.sub(r"([$&%#_~^])", r"\\\1", text)
  return text


def citation_fields(paper: Paper) -> dict:
  """Extract common citation fields from a paper."""
  meta = paper.metadata_json or {}

  # Authors — list of "Last, First Middle" strings
  authors_raw = meta.get("author") or meta.get("authors_list") or ""
  if isinstance(authors_raw, list):
    authors = authors_raw
  elif isinstance(authors_raw, str):
    authors = _parse_authors(authors_raw)
  else:
    authors = []

  # Year
  year = _extract_year(paper, meta)

  # Journal
  journal = meta.get("journal") or meta.get("producer") or ""

  # Publisher
  publisher = meta.get("publisher") or ""

  # Volume, issue, pages from dedicated columns or metadata
  volume = paper.volume or meta.get("volume") or ""
  issue = paper.issue or meta.get("issue") or ""
  pages = paper.pages or meta.get("pages") or ""

  # DOI
  doi = paper.doi or ""

  # URL
  url = paper.url or ""

  return {
    "authors": authors,
    "year": year,
    "title": paper.title or "Untitled",
    "journal": journal,
    "publisher": publisher,
    "volume": volume,
    "issue": issue,
    "pages": pages,
    "doi": doi,
    "url": url,
    "issn": meta.get("issn") or paper.issn or "",
  }


def _parse_authors(author_string: str) -> list[str]:
  """Parse a delimited author string into a list of 'Last, First' names."""
  if not author_string:
    return []

  for delimiter in [";", "|", "\n"]:
    if delimiter in author_string:
      author_string = author_string.replace(delimiter, ",")

  parts = [part.strip() for part in author_string.split(",") if part.strip()]

  if len(parts) >= 2 and len(parts) % 2 == 0:
    return [f"{parts[i]}, {parts[i + 1]}" for i in range(0, len(parts), 2)]
  return parts


def _extract_year(paper: Paper, meta: dict) -> str:
  pub_date = meta.get("publication_date")
  if pub_date:
    try:
      return str(datetime.strptime(str(pub_date)[:10], "%Y-%m-%d").year)
    except ValueError:
      pass
  year = meta.get("year")
  if year:
    try:
      return str(int(str(year)[:4]))
    except (ValueError, TypeError):
      pass
  if paper.created_at:
    return str(paper.created_at.year)
  return "n.d."


def _format_authors_apa(authors: list[str]) -> str:
  """Format authors per APA: Last, F. I., & Last, F. I."""
  if not authors:
    return "Unknown"
  parts = []
  for author in authors[:8]:
    parts.append(_to_initials(author))
  if len(authors) > 8:
    return ", ".join(parts[:7]) + f", ... {parts[-1]}"
  if len(parts) > 1:
    return ", ".join(parts[:-1]) + f", & {parts[-1]}"
  return parts[0]


def _format_authors_mla(authors: list[str]) -> str:
  """Format authors per MLA: Last, First, and Last, First, et al."""
  if not authors:
    return "Unknown"
  parts = []
  for author in authors[:3]:
    parts.append(_to_last_first(author))
  if len(authors) > 3:
    return ", ".join(parts) + ", et al."
  if len(parts) > 1:
    return ", ".join(parts[:-1]) + f", and {parts[-1]}"
  return parts[0]


def _format_authors_chicago(authors: list[str]) -> str:
  """Format authors per Chicago: Last, First, and Last, First."""
  if not authors:
    return "Unknown"
  parts = []
  for author in authors[:8]:
    parts.append(_to_last_first(author))
  if len(authors) > 8:
    return ", ".join(parts[:7]) + f", and {parts[-1]}"
  if len(parts) > 1:
    return ", ".join(parts[:-1]) + f", and {parts[-1]}"
  return parts[0]


def _format_authors_ieee(authors: list[str]) -> str:
  """Format authors per IEEE: F. Last, F. Last, et al."""
  if not authors:
    return "Unknown"
  parts = []
  for author in authors[:6]:
    parts.append(_to_ieee_name(author))
  if len(authors) > 6:
    return ", ".join(parts) + " et al."
  return ", ".join(parts)


def _to_ieee_name(author: str) -> str:
  """Convert 'Last, First Middle' to 'F. M. Last' per IEEE convention."""
  match = re.match(r"^(.+?),\s+(.+)$", author)
  if not match:
    return author
  last = match.group(1)
  first_part = match.group(2)
  initials = " ".join(f"{w[0]}." for w in first_part.split() if w)
  return f"{initials} {last}"


def _to_initials(author: str) -> str:
  """Convert 'Last, First Middle' to 'Last, F. M.'"""
  match = re.match(r"^(.+?),\s+(.+)$", author)
  if not match:
    return author
  last = match.group(1)
  first_part = match.group(2)
  initials = " ".join(f"{w[0]}." for w in first_part.split() if w)
  return f"{last}, {initials}"


def _to_last_first(author: str) -> str:
  """Convert 'Last, First Middle' to 'Last, First Middle' (passthrough).
  Actually return 'Last, First M.' style."""
  return author


def _doi_url(doi: str) -> str:
  """Return a full DOI URL string."""
  if not doi:
    return ""
  if doi.startswith("arxiv:"):
    return f" arXiv:{doi.replace('arxiv:', '')}."
  return f" https://doi.org/{doi}."


def _season(paper: Paper) -> str:
  """Format as 'Last, F.' (no comma after last)."""
  return paper


class ReferenceFormatter:
  @staticmethod
  def format_apa(paper: Paper) -> str:
    fields = citation_fields(paper)
    author_str = _format_authors_apa(fields["authors"])
    ref = f"{author_str} ({fields['year']}). {fields['title']}."
    if fields["journal"]:
      ref += f" *{fields['journal']}*"
      if fields["volume"]:
        ref += f", *{fields['volume']}*"
        if fields["issue"]:
          ref += f"({fields['issue']})"
      if fields["pages"]:
        ref += f", {fields['pages']}"
      ref += "."
    if fields["doi"]:
      ref += f" {_doi_url(fields['doi'])}"
    return ref

  @staticmethod
  def format_mla(paper: Paper) -> str:
    fields = citation_fields(paper)
    author_str = _format_authors_mla(fields["authors"])
    ref = f'{author_str}. "{fields["title"]}."'
    if fields["journal"]:
      ref += f" *{fields['journal']}*"
      if fields["volume"]:
        ref += f", vol. {fields['volume']}"
      if fields["issue"]:
        ref += f", no. {fields['issue']}"
      if fields["year"]:
        ref += f", {fields['year']}"
      if fields["pages"]:
        ref += f", pp. {fields['pages']}"
      ref += "."
    elif fields["publisher"]:
      ref += f" {fields['publisher']}, {fields['year']}."
    if fields["doi"]:
      ref += f" {_doi_url(fields['doi'])}"
    return ref

  @staticmethod
  def format_chicago(paper: Paper) -> str:
    fields = citation_fields(paper)
    author_str = _format_authors_chicago(fields["authors"])
    ref = f'{author_str}. {fields["year"]}. "{fields["title"]}."'
    if fields["journal"]:
      ref += f" *{fields['journal']}*"
      if fields["volume"]:
        ref += f" {fields['volume']}"
      if fields["issue"]:
        ref += f", no. {fields['issue']}"
      if fields["pages"]:
        ref += f": {fields['pages']}"
      ref += "."
    elif fields["publisher"]:
      ref += f" {fields['publisher']}."
    if fields["doi"]:
      ref += f" {_doi_url(fields['doi'])}"
    return ref

  @staticmethod
  def format_ieee(paper: Paper) -> str:
    fields = citation_fields(paper)
    author_str = _format_authors_ieee(fields["authors"])
    ref = f'{author_str}, "{fields["title"]},"'
    if fields["journal"]:
      ref += f" *{fields['journal']}*"
    if fields["volume"]:
      ref += f", vol. {fields['volume']}"
    if fields["issue"]:
      ref += f", no. {fields['issue']}"
    if fields["pages"]:
      ref += f", pp. {fields['pages']}"
    ref += f", {fields['year']}."
    if fields["doi"]:
      ref += f" doi: {fields['doi']}"
    return ref

  @staticmethod
  def format_bibtex(paper: Paper) -> str:
    fields = citation_fields(paper)

    # Citation key
    key = "paper"
    if fields["doi"]:
      key = fields["doi"].replace(":", "_").replace("/", "_").replace(".", "_")
    elif fields["title"]:
      words = re.findall(r"\w+", fields["title"])[:3]
      key = "_".join(w.lower()[:8] for w in words)

    escaped_title = _escape_bibtex(fields["title"])
    escaped_journal = _escape_bibtex(fields["journal"])
    escaped_publisher = _escape_bibtex(fields["publisher"])

    author_str = " and ".join(fields["authors"]) if fields["authors"] else "Unknown"

    lines = [f"@article{{{key},"]
    lines.append(f"  author = {{{author_str}}},")
    lines.append(f"  title = {{{{{escaped_title}}}}},")
    lines.append(f"  year = {{{fields['year']}}},")
    lines.append(f"  journal = {{{{{escaped_journal}}}}}" if escaped_journal else "")
    if fields["volume"]:
      lines.append(f"  volume = {{{fields['volume']}}},")
    if fields["issue"]:
      lines.append(f"  number = {{{fields['issue']}}},")
    if fields["pages"]:
      lines.append(f"  pages = {{{fields['pages']}}},")
    if fields["publisher"]:
      lines.append(f"  publisher = {{{{{escaped_publisher}}}}},")
    if fields["doi"]:
      if fields["doi"].startswith("arxiv:"):
        lines.append(f"  eprint = {{{fields['doi'].replace('arxiv:', '')}}},")
        lines.append("  archivePrefix = {arXiv},")
      else:
        lines.append(f"  doi = {{{fields['doi']}}},")
    if fields["url"]:
      lines.append(f"  url = {{{fields['url']}}},")
    if fields["issn"]:
      lines.append(f"  issn = {{{fields['issn']}}},")
    # Remove trailing commas from last non-empty field
    non_empty = [l for l in lines if l]
    last = non_empty[-1]
    if last.endswith(","):
      non_empty[-1] = last[:-1]
    non_empty.append("}")
    return "\n".join(non_empty)


reference_formatter = ReferenceFormatter()
