from difflib import SequenceMatcher
from typing import List, Tuple, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.paper import Paper


class DuplicateDetectionService:
  def calculate_title_similarity(self, title1: str, title2: str) -> float:
    """Calculate similarity between two titles using SequenceMatcher."""
    if not title1 or not title2:
      return 0.0
    return SequenceMatcher(None, title1.lower(), title2.lower()).ratio()

  def calculate_content_similarity(
    self, embedding1: List[float], embedding2: List[float]
  ) -> float:
    """Calculate cosine similarity between embeddings."""
    if not embedding1 or not embedding2:
      return 0.0
    if len(embedding1) != len(embedding2):
      return 0.0

    dot_product = sum(a * b for a, b in zip(embedding1, embedding2, strict=True))
    magnitude1 = sum(a * a for a in embedding1) ** 0.5
    magnitude2 = sum(b * b for b in embedding2) ** 0.5

    if magnitude1 == 0 or magnitude2 == 0:
      return 0.0

    return dot_product / (magnitude1 * magnitude2)

  async def find_duplicates(
    self, session: AsyncSession, paper_id: int, threshold: float = 0.8
  ) -> List[Tuple[Paper, float, str]]:
    """Find potential duplicates for a paper."""
    query = select(Paper).where(Paper.id == paper_id)
    result = await session.execute(query)
    paper = result.scalar_one_or_none()

    if not paper:
      return []

    # Get all other papers
    all_papers_query = select(Paper).where(Paper.id != paper_id)
    all_papers_result = await session.execute(all_papers_query)
    all_papers = all_papers_result.scalars().all()

    duplicates = []

    for candidate in all_papers:
      confidence = 0.0
      method = ""

      # Method 1: DOI matching (highest confidence)
      if paper.doi and candidate.doi and paper.doi == candidate.doi:
        duplicates.append((candidate, 1.0, "doi"))
        continue

      # Method 2: Title similarity
      title_sim = self.calculate_title_similarity(
        cast(str, paper.title) or "", cast(str, candidate.title) or ""
      )
      if title_sim > confidence:
        confidence = title_sim
        method = "title"

      # Method 3: Content similarity (if embeddings available)
      if paper.embedding and candidate.embedding:
        content_sim = self.calculate_content_similarity(
          cast(list[int | float], paper.embedding),
          cast(list[int | float], candidate.embedding),
        )
        if content_sim > confidence:
          confidence = content_sim
          method = "content"

      # Method 4: Author + Title combination
      if paper.metadata_json and candidate.metadata_json:
        paper_author = paper.metadata_json.get("author") or ""
        candidate_author = candidate.metadata_json.get("author") or ""
        if (
          paper_author
          and candidate_author
          and paper_author.lower() == candidate_author.lower()
        ):
          title_sim = self.calculate_title_similarity(
            cast(str, paper.title) or "", cast(str, candidate.title) or ""
          )
          if title_sim > 0.7:
            combined_confidence = (title_sim + 0.9) / 2
            if combined_confidence > confidence:
              confidence = combined_confidence
              method = "author_title"

      if confidence >= threshold:
        duplicates.append((candidate, confidence, method))

    # Sort by confidence descending
    duplicates.sort(key=lambda x: x[1], reverse=True)
    return duplicates


duplicate_detection_service = DuplicateDetectionService()
