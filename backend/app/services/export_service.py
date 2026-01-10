import csv
import io
import json
from typing import List

from app.models.paper import Paper


class ExportService:
  def export_csv(self, papers: List[Paper]) -> str:
    """Export papers to CSV format."""
    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow(
      [
        "ID",
        "Title",
        "DOI",
        "URL",
        "Authors",
        "Journal",
        "Tags",
        "Groups",
        "Reading Status",
        "Priority",
        "Reading Time (min)",
        "Created At",
      ]
    )

    # Write data
    for paper in papers:
      authors = (
        paper.metadata_json.get("author")
        or paper.metadata_json.get("authors_list")
        or ""
      )
      if isinstance(authors, list):
        authors = ", ".join(authors)
      journal = (
        paper.metadata_json.get("journal") or paper.metadata_json.get("producer") or ""
      )
      tags = ", ".join([tag.name for tag in getattr(paper, "tags", [])])
      groups = ", ".join([group.name for group in getattr(paper, "groups", [])])

      writer.writerow(
        [
          paper.id,
          paper.title,
          paper.doi or "",
          paper.url or "",
          authors,
          journal,
          tags,
          groups,
          getattr(paper, "reading_status", "not_started"),
          getattr(paper, "priority", "low"),
          getattr(paper, "reading_time_minutes", 0),
          paper.created_at.isoformat() if paper.created_at else "",
        ]
      )

    return output.getvalue()

  def export_json(self, papers: List[Paper], include_annotations: bool = False) -> str:
    """Export papers to JSON format."""
    papers_data = []
    for paper in papers:
      paper_dict = {
        "id": paper.id,
        "title": paper.title,
        "doi": paper.doi,
        "url": paper.url,
        "metadata": paper.metadata_json,
        "reading_status": getattr(paper, "reading_status", "not_started"),
        "priority": getattr(paper, "priority", "low"),
        "reading_time_minutes": getattr(paper, "reading_time_minutes", 0),
        "created_at": paper.created_at.isoformat() if paper.created_at else None,
      }
      if include_annotations:
        paper_dict["annotations"] = [
          {
            "id": ann.id,
            "content": ann.content,
            "type": ann.type,
          }
          for ann in getattr(paper, "annotations", [])
        ]
      papers_data.append(paper_dict)

    return json.dumps(papers_data, indent=2)

  def export_ris(self, papers: List[Paper]) -> str:
    """Export papers to RIS format."""
    ris_lines = []
    for paper in papers:
      ris_lines.append("TY  - JOUR")
      ris_lines.append(f"TI  - {paper.title}")
      if paper.doi:
        ris_lines.append(f"DO  - {paper.doi}")
      if paper.url:
        ris_lines.append(f"UR  - {paper.url}")
      authors = (
        paper.metadata_json.get("author")
        or paper.metadata_json.get("authors_list")
        or ""
      )
      if isinstance(authors, list):
        for author in authors:
          ris_lines.append(f"AU  - {author}")
      elif authors:
        ris_lines.append(f"AU  - {authors}")
      journal = (
        paper.metadata_json.get("journal") or paper.metadata_json.get("producer") or ""
      )
      if journal:
        ris_lines.append(f"JO  - {journal}")
      if paper.created_at:
        ris_lines.append(f"PY  - {paper.created_at.year}")
      ris_lines.append("ER  -")
      ris_lines.append("")

    return "\n".join(ris_lines)

  def export_endnote(self, papers: List[Paper]) -> str:
    """Export papers to EndNote format."""
    endnote_lines = []
    for paper in papers:
      endnote_lines.append("%0 Journal Article")
      endnote_lines.append(f"%T {paper.title}")
      if paper.doi:
        endnote_lines.append(f"%R {paper.doi}")
      authors = (
        paper.metadata_json.get("author")
        or paper.metadata_json.get("authors_list")
        or ""
      )
      if isinstance(authors, list):
        for author in authors:
          endnote_lines.append(f"%A {author}")
      elif authors:
        endnote_lines.append(f"%A {authors}")
      journal = (
        paper.metadata_json.get("journal") or paper.metadata_json.get("producer") or ""
      )
      if journal:
        endnote_lines.append(f"%J {journal}")
      if paper.url:
        endnote_lines.append(f"%U {paper.url}")
      endnote_lines.append("")

    return "\n".join(endnote_lines)


export_service = ExportService()
