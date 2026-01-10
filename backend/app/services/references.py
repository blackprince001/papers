from datetime import datetime
from typing import Optional

from app.models.paper import Paper


class ReferenceFormatter:
  @staticmethod
  def parse_authors(author_string: Optional[str]) -> list[str]:
    if not author_string:
      return []

    authors = []
    for delimiter in [";", "|", "\n"]:
      if delimiter in author_string:
        author_string = author_string.replace(delimiter, ",")

    parts = [part.strip() for part in author_string.split(",") if part.strip()]

    if len(parts) >= 2 and len(parts) % 2 == 0:
      # Assume format: Last1, First1, Last2, First2
      authors = [f"{parts[i + 1]} {parts[i]}" for i in range(0, len(parts), 2)]
    else:
      # Just use as-is, might be "First Last" format
      authors = parts

    return authors if authors else [author_string]

  @staticmethod
  def format_apa(paper: Paper) -> str:
    metadata = paper.metadata_json or {}

    # Authors
    authors = ReferenceFormatter.parse_authors(metadata.get("author"))
    if authors:
      # Format: Last, F. M., Last2, F. M., & Last3, F. M.
      author_parts = []
      for author in authors[:8]:  # Limit to 8 authors
        parts = author.split()
        if len(parts) >= 2:
          last = parts[-1]
          first_initials = " ".join([p[0] + "." for p in parts[:-1] if p])
          author_parts.append(f"{last}, {first_initials}")
        else:
          author_parts.append(author)

      if len(authors) > 8:
        author_str = ", ".join(author_parts[:7]) + f", ... {author_parts[-1]}"
      elif len(author_parts) > 1:
        author_str = ", ".join(author_parts[:-1]) + f", & {author_parts[-1]}"
      else:
        author_str = author_parts[0] if author_parts else "Unknown"
    else:
      author_str = "Unknown"

    # Year - try metadata first, then paper created_at
    year = "n.d."
    if metadata.get("created_at"):
      try:
        date_str = str(metadata.get("created_at"))
        if date_str:
          for fmt in ["%Y-%m-%d", "%Y", "%Y-%m"]:
            try:
              dt = datetime.strptime(date_str[:10], fmt)
              year = str(dt.year)
              break
            except ValueError:
              continue
      except (ValueError, TypeError):
        pass

    # Fallback to paper's created_at if no year found
    if year == "n.d." and paper.created_at:
      try:
        year = str(paper.created_at.year)
      except (AttributeError, TypeError, ValueError):
        pass

    # Title
    title = paper.title or "Untitled"

    # Publisher/Journal (if available)
    publisher = metadata.get("producer") or metadata.get("creator") or ""

    # DOI
    doi_str = ""
    if paper.doi:
      if paper.doi.startswith("arxiv:"):
        doi_str = f" arXiv:{paper.doi.replace('arxiv:', '')}"
      else:
        doi_str = f" https://doi.org/{paper.doi}"

    # Construct APA reference
    reference = f"{author_str} ({year}). {title}."
    if publisher:
      reference += f" {publisher}."
    if doi_str:
      reference += doi_str

    return reference

  @staticmethod
  def format_mla(paper: Paper) -> str:
    metadata = paper.metadata_json or {}

    # Authors
    authors = ReferenceFormatter.parse_authors(metadata.get("author"))
    if authors:
      # Format: Last, First, and First Last
      author_parts = []
      for author in authors[:3]:  # MLA typically shows first 3
        parts = author.split()
        if len(parts) >= 2:
          last = parts[-1]
          first = " ".join(parts[:-1])
          author_parts.append(f"{last}, {first}")
        else:
          author_parts.append(author)

      if len(authors) > 3:
        author_str = ", ".join(author_parts) + ", et al."
      elif len(author_parts) > 1:
        author_str = ", ".join(author_parts[:-1]) + f", and {author_parts[-1]}"
      else:
        author_str = author_parts[0]
    else:
      author_str = "Unknown"

    # Title
    title = paper.title or "Untitled"

    # Publisher
    publisher = metadata.get("producer") or metadata.get("creator") or "Unknown"

    # Year - try metadata first, then paper created_at
    year = "n.d."
    if metadata.get("created_at"):
      try:
        date_str = str(metadata.get("created_at"))
        if date_str:
          for fmt in ["%Y-%m-%d", "%Y", "%Y-%m"]:
            try:
              dt = datetime.strptime(date_str[:10], fmt)
              year = str(dt.year)
              break
            except ValueError:
              continue
      except (ValueError, TypeError):
        pass

    # Fallback to paper's created_at if no year found
    if year == "n.d." and paper.created_at:
      try:
        year = str(paper.created_at.year)
      except (AttributeError, TypeError, ValueError):
        pass

    # DOI
    doi_str = ""
    if paper.doi:
      if paper.doi.startswith("arxiv:"):
        doi_str = f" arXiv:{paper.doi.replace('arxiv:', '')}."
      else:
        doi_str = f" https://doi.org/{paper.doi}."

    # Construct MLA reference
    reference = f'{author_str}. "{title}." {publisher}, {year}.{doi_str}'

    return reference

  @staticmethod
  def format_bibtex(paper: Paper) -> str:
    metadata = paper.metadata_json or {}

    # Generate citation key from title or DOI
    citation_key = "paper"
    if paper.doi:
      citation_key = paper.doi.replace(":", "_").replace("/", "_").replace(".", "_")
    elif paper.title:
      # Use first few words of title
      words = paper.title.split()[:3]
      citation_key = "_".join([w.lower()[:8] for w in words if w.isalnum()])

    # Authors
    authors = ReferenceFormatter.parse_authors(metadata.get("author"))
    author_str = " and ".join(authors) if authors else "Unknown"

    # Title
    title = paper.title or "Untitled"

    # Year - try metadata first, then paper created_at
    year = "n.d."
    if metadata.get("created_at"):
      try:
        date_str = str(metadata.get("created_at"))
        if date_str:
          for fmt in ["%Y-%m-%d", "%Y", "%Y-%m"]:
            try:
              dt = datetime.strptime(date_str[:10], fmt)
              year = str(dt.year)
              break
            except ValueError:
              continue
      except (ValueError, TypeError):
        pass

    # Fallback to paper's created_at if no year found
    if year == "n.d." and paper.created_at:
      try:
        year = str(paper.created_at.year)
      except (AttributeError, TypeError, ValueError):
        pass

    # Build BibTeX entry
    bibtex = f"@article{{{citation_key},\n"
    bibtex += f"  author = {{{author_str}}},\n"
    bibtex += f"  title = {{{{{title}}}}},\n"
    bibtex += f"  year = {{{year}}}"

    # Add optional fields
    if paper.doi:
      if paper.doi.startswith("arxiv:"):
        bibtex += f",\n  eprint = {{{paper.doi.replace('arxiv:', '')}}}"
        bibtex += ",\n  archivePrefix = {arXiv}"
      else:
        bibtex += f",\n  doi = {{{paper.doi}}}"

    if paper.url:
      bibtex += f",\n  url = {{{paper.url}}}"

    if metadata.get("journal"):
      bibtex += f",\n  journal = {{{{{metadata.get('journal')}}}}}"

    if metadata.get("publisher"):
      bibtex += f",\n  publisher = {{{{{metadata.get('publisher')}}}}}"

    bibtex += "\n}"

    return bibtex

  @staticmethod
  def format_chicago(paper: Paper) -> str:
    metadata = paper.metadata_json or {}
    authors = ReferenceFormatter.parse_authors(metadata.get("author"))

    if authors:
      author_parts = []
      for author in authors[:8]:
        parts = author.split()
        if len(parts) >= 2:
          last = parts[-1]
          first = " ".join(parts[:-1])
          author_parts.append(f"{last}, {first}")
        else:
          author_parts.append(author)

      if len(authors) > 8:
        author_str = ", ".join(author_parts[:7]) + f", and {author_parts[-1]}"
      elif len(author_parts) > 1:
        author_str = ", ".join(author_parts[:-1]) + f", and {author_parts[-1]}"
      else:
        author_str = author_parts[0] if author_parts else "Unknown"
    else:
      author_str = "Unknown"

    year = "n.d."
    if metadata.get("created_at"):
      try:
        date_str = str(metadata.get("created_at"))
        if date_str:
          for fmt in ["%Y-%m-%d", "%Y", "%Y-%m"]:
            try:
              dt = datetime.strptime(date_str[:10], fmt)
              year = str(dt.year)
              break
            except ValueError:
              continue
      except (ValueError, TypeError):
        pass

    if year == "n.d." and paper.created_at:
      try:
        year = str(paper.created_at.year)
      except (AttributeError, TypeError, ValueError):
        pass

    title = paper.title or "Untitled"
    publisher = metadata.get("producer") or metadata.get("creator") or ""

    reference = f'{author_str}. {year}. "{title}."'
    if publisher:
      reference += f" {publisher}."
    if paper.doi:
      reference += f" https://doi.org/{paper.doi}"

    return reference

  @staticmethod
  def format_ieee(paper: Paper) -> str:
    metadata = paper.metadata_json or {}
    authors = ReferenceFormatter.parse_authors(metadata.get("author"))

    if authors:
      author_parts = []
      for author in authors[:6]:
        parts = author.split()
        if len(parts) >= 2:
          last = parts[-1]
          first_initials = ". ".join([p[0].upper() + "." for p in parts[:-1] if p])
          author_parts.append(f"{last}, {first_initials}")
        else:
          author_parts.append(author)

      if len(authors) > 6:
        author_str = ", ".join(author_parts) + " et al."
      else:
        author_str = ", ".join(author_parts)
    else:
      author_str = "Unknown"

    title = paper.title or "Untitled"
    journal = metadata.get("journal") or metadata.get("producer") or ""

    year = "n.d."
    if metadata.get("created_at"):
      try:
        date_str = str(metadata.get("created_at"))
        if date_str:
          for fmt in ["%Y-%m-%d", "%Y", "%Y-%m"]:
            try:
              dt = datetime.strptime(date_str[:10], fmt)
              year = str(dt.year)
              break
            except ValueError:
              continue
      except (ValueError, TypeError):
        pass

    if year == "n.d." and paper.created_at:
      try:
        year = str(paper.created_at.year)
      except (AttributeError, TypeError, ValueError):
        pass

    reference = f'{author_str}, "{title},"'
    if journal:
      reference += f" {journal}"
    reference += f", {year}."
    if paper.doi:
      reference += f" doi: {paper.doi}"

    return reference


reference_formatter = ReferenceFormatter()
