"""Utility functions for extracting citations from Google Search grounding metadata."""


def add_citations(response) -> str:
  """
  Extract citations from grounding metadata and insert them into the response text.

  Citations are inserted as markdown links at the positions indicated by
  the grounding metadata segments. Supports are sorted by end_index in
  descending order to avoid shifting issues when inserting.

  Args:
      response: The response object from Google GenAI API with grounding metadata

  Returns:
      The text with citations inserted as markdown links
  """
  if not hasattr(response, "text") or not response.text:
    return ""

  text = response.text

  # Check if response has grounding metadata
  if not hasattr(response, "candidates") or not response.candidates:
    return text

  candidate = response.candidates[0]
  if not hasattr(candidate, "grounding_metadata"):
    return text

  grounding_metadata = candidate.grounding_metadata

  # Get grounding supports and chunks
  if not hasattr(grounding_metadata, "grounding_supports") or not hasattr(
    grounding_metadata, "grounding_chunks"
  ):
    return text

  supports = grounding_metadata.grounding_supports
  chunks = grounding_metadata.grounding_chunks

  if not supports or not chunks:
    return text

  # Sort supports by end_index in descending order to avoid shifting issues when inserting
  sorted_supports = sorted(
    supports,
    key=lambda s: s.segment.end_index if hasattr(s.segment, "end_index") else 0,
    reverse=True,
  )

  # Insert citations at the appropriate positions
  for support in sorted_supports:
    if not hasattr(support, "segment") or not hasattr(support.segment, "end_index"):
      continue

    end_index = support.segment.end_index

    if support.grounding_chunk_indices:
      # Create citation string like [1](url1), [2](url2)
      citation_links = []
      for chunk_idx in support.grounding_chunk_indices:
        if (
          chunk_idx < len(chunks)
          and hasattr(chunks[chunk_idx], "web")
          and hasattr(chunks[chunk_idx].web, "uri")
        ):
          uri = chunks[chunk_idx].web.uri
          # Use chunk index + 1 for citation number (1-indexed for display)
          citation_links.append(f"[{chunk_idx + 1}]({uri})")

      if citation_links:
        citation_string = ", ".join(citation_links)
        # Insert citation at the end_index position
        text = text[:end_index] + citation_string + text[end_index:]

  return text
