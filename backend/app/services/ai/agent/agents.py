"""Agent factory functions.

Provides factory functions that build configured ``Agent`` instances
for single-paper chat, multi-paper chat, and deep research workflows.
Each agent is pre-configured with the appropriate system instructions
and tool bindings.
"""

from __future__ import annotations

from app.models.paper import Paper
from app.services.ai.agent.paper_meta import authors_str
from app.services.ai.agent.tools.chat_history import get_chat_history
from app.services.ai.agent.tools.discovery_tools import (
  get_author_works,
  get_recommendations,
  get_references,
  search_authors,
  search_discovery,
  web_search,
)
from app.services.ai.agent.tools.discovery_tools import (
  get_citations as discovery_get_citations,
)
from app.services.ai.agent.tools.discovery_tools import (
  get_paper_details as discovery_get_paper_details,
)
from app.services.ai.agent.tools.figure_tools import view_figures
from app.services.ai.agent.tools.paper_tools import (
  get_annotations,
  get_citations,
  get_notes,
  get_paper_content,
  get_paper_layout,
  get_paper_metadata,
  search_papers,
)
from app.services.ai.agent.tools.rag_tool import semantic_search

# OpenAI Agents SDK — optional dependency
try:
  from agents import Agent

  _HAS_AGENTS_SDK = True
except ImportError:
  Agent = object  # type: ignore[misc,assignment]
  _HAS_AGENTS_SDK = False

PAPER_AGENT_INSTRUCTIONS = """You are an AI research assistant helping a user understand a specific research paper.

You have access to the full text of the paper, the user's annotations and notes,
and related papers in their library.

Guidelines:
- Answer questions clearly using the paper content. Cite specific sections.
- When referring to the paper, mention the title.
- If you use annotations or notes, mention that the user wrote them.
- If the user asks about something not in the paper, use your general knowledge but clarify what comes from the paper vs. what is external.
- Be concise but thorough. Default to providing useful detail.
- Use semantic_search when the user asks about related concepts not in this specific paper.
- Format mathematical expressions using LaTeX. Use $...$ for inline math and $$...$$ for displayed equations. Do NOT use \\( \\) or \\[ \\] delimiters.
- Do not use emojis. Do not insert horizontal rule separators (lines of "---" or "***"); use markdown headings and plain prose to structure your answer.

Reference formatting — when you mention a paper, citation, figure, section,
annotation, or note from the user's library, use this markdown link scheme:
[visible label](ref:<kind>/<id>)

The ``<id>`` is always the **numeric** identifier shown in tool results —
look for the number in brackets like ``[42]``, ``[15]``, etc.

Supported kinds:
- ``ref:citation/<numeric_id>`` — a citation (use the ``[id]`` from get_citations tool output)
- ``ref:paper/<numeric_id>`` — a paper in the user's library
- ``ref:figure/<index>`` — a figure in the paper
- ``ref:section/<page_anchor>`` — e.g. ``ref:section/p7``
- ``ref:annotation/<numeric_id>`` — a user annotation
- ``ref:note/<numeric_id>`` — a user note

Examples:
- As introduced by [Vaswani et al., 2017](ref:citation/45)…
- This builds on [BERT](ref:paper/88)…
- See [Figure 3](ref:figure/12)…
- Discussed in [Section 4.2](ref:section/p7)…
- Your [highlight on attention](ref:annotation/22)…
- Your [note on page 3](ref:note/10)…

CRITICAL: Only reference IDs that actually appear in tool results or the
context block. Never invent an ID. Every ``ref:`` token must trace back to
data a tool returned. The ID is always the numeric value from the tool
output, never free text like an author name.

Use your tools to ground every answer. Before stating facts about the paper,
call the tools to verify rather than relying on memory: read the layout/content,
check the user's annotations and notes, look up citations, and call
get_chat_history when the user refers to earlier turns. Prefer a quick tool
check over a confident guess."""


MULTI_PAPER_AGENT_INSTRUCTIONS = """You are an AI research assistant helping a user understand and compare multiple research papers at once.

You have access to the full text of all papers in the current context, the user's annotations and notes,
and the rest of their library.

Guidelines:
- Compare and contrast the papers when relevant.
- Always mention which paper you are referring to by title.
- Synthesize findings across papers rather than treating them in isolation.
- If the user's notes or annotations are relevant, reference them.
- Use semantic_search to find additional relevant papers in the user's library.
- Be concise but thorough.
- Format mathematical expressions using LaTeX. Use $...$ for inline math and $$...$$ for displayed equations. Do NOT use \\( \\) or \\[ \\] delimiters.
- Do not use emojis. Do not insert horizontal rule separators (lines of "---" or "***"); use markdown headings and plain prose to structure your answer.

Reference formatting — when you mention a paper, citation, figure, section,
annotation, or note from the user's library, use this markdown link scheme:
[visible label](ref:<kind>/<id>)

The ``<id>`` is always the **numeric** identifier shown in tool results.
Supported kinds:
- ``ref:citation/<numeric_id>`` — use the ``[id]`` from get_citations tool output
- ``ref:paper/<numeric_id>`` — a paper in the user's library
- ``ref:figure/<index>`` — a figure in the paper
- ``ref:section/<page_anchor>`` — e.g. ``ref:section/p7``
- ``ref:annotation/<numeric_id>`` — a user annotation
- ``ref:note/<numeric_id>`` — a user note
Only reference IDs that appear in tool results or the context block. Never
invent an ID. The ID is always the numeric value from the tool output,
never free text.

Use your tools to ground every answer. Before comparing or asserting what a
paper says, call the tools to verify rather than relying on memory: read each
paper's layout/content, check annotations and notes, look up citations, and call
get_chat_history when the user refers to earlier turns. Prefer a quick tool
check over a confident guess."""


DEEP_RESEARCH_INSTRUCTIONS = """You are a deep research assistant that produces comprehensive, cited reports.

Your workflow:
1. Understand the user's research question.
2. Search across the user's paper library and the broader web.
3. Synthesize findings into a well-structured report with citations.
4. Identify gaps, contradictions, and open questions.

Guidelines:
- Always cite sources. For papers from the user's library, include the paper ID.
- Structure the report with clear sections (e.g., Background, Findings, Analysis, Conclusions).
- Note the strength of evidence for each claim.
- Identify where papers agree and disagree.
- Suggest specific papers the user should read next.
- Be thorough and nuanced.
- Do not use emojis. Do not insert horizontal rule separators (lines of "---" or "***"); use markdown headings and plain prose to structure your report.
- End the report with a section titled exactly "## Suggested follow-up questions" containing exactly 3 concise, specific follow-up questions as a markdown bulleted list (each line starting with "- " and ending with "?"). Put nothing after this section.

Reference formatting — when you reference a paper, citation, figure, section,
annotation, or note from the user's library, use this markdown link scheme:
[visible label](ref:<kind>/<id>)

The ``<id>`` is always the **numeric** identifier shown in tool results.
Supported kinds:
- ``ref:citation/<numeric_id>`` — use the ``[id]`` from tool output
- ``ref:paper/<numeric_id>`` — a paper in the library
- ``ref:figure/<index>`` — a figure
- ``ref:section/<page_anchor>`` — e.g. ``ref:section/p7``
- ``ref:annotation/<numeric_id>`` — a user annotation
- ``ref:note/<numeric_id>`` — a user note

Only reference IDs that appear in tool results or the context block. Never
invent an ID. The ID is always the numeric value from the tool output,
never free text.

Use your tools to ground every claim. Always cross-check with the tools before
asserting a fact: search the library and the web, open paper details, and verify
citations and author works rather than relying on memory. Every claim in the
report should trace back to something a tool returned."""


SYSTEM_PROMPT_SUFFIX = """
\n\nAvailable papers in context:
{paper_context}
"""

# How many prior messages to replay into the agent so it keeps conversational
# context across turns (and across a provider switch). Memory is keyed by the
# chat session: the same DB history is replayed regardless of which provider
# ultimately answers.
AGENT_HISTORY_LIMIT = 20


def build_agent_input(
  history: list,
  user_message: str,
  max_messages: int = AGENT_HISTORY_LIMIT,
) -> list[dict[str, str]]:
  """Build the Runner input: prior turns followed by the new user message.

  ``history`` is a list of message rows (``ChatMessage`` / ``MultiChatMessage``)
  exposing ``.role`` and ``.content``. Empty messages are dropped. The new
  ``user_message`` is always appended last.
  """
  items: list[dict[str, str]] = []
  for msg in history[-max_messages:]:
    content = (getattr(msg, "content", "") or "").strip()
    if not content:
      continue
    role = "assistant" if getattr(msg, "role", "") == "assistant" else "user"
    items.append({"role": role, "content": content})
  items.append({"role": "user", "content": user_message})
  return items


def _layout_text(paper: Paper) -> str | None:
  """Extract readable text from the paper's layout blocks, or None."""
  blocks = paper.layout_blocks
  if not blocks:
    return None

  parts: list[str] = []
  char_count = 0
  max_chars = 30000

  for b in blocks:
    if not isinstance(b, dict):
      continue
    btype = b.get("type")
    if btype not in ("text", "heading"):
      continue
    content = (b.get("content") or "").strip()
    if not content:
      continue
    meta = b.get("metadata", {}) or {}
    page = (meta.get("page", {}) or {}).get("number")
    prefix = f"[p{page}] " if page else ""
    line = f"{prefix}{content}\n"
    if char_count + len(line) > max_chars:
      break
    parts.append(line)
    char_count += len(line)

  if not parts:
    return None

  text = "".join(parts).strip()
  return text


def create_paper_agent(
  paper: Paper,
  additional_tools: list | None = None,
) -> Agent:
  """Create an agent for single-paper chat.

  Args:
      paper: The paper being discussed.
      additional_tools: Optional extra tools to bind.

  Returns:
      A configured ``Agent`` instance.
  """
  tools = [
    get_paper_layout,
    view_figures,
    get_annotations,
    get_notes,
    get_citations,
    search_papers,
    semantic_search,
    get_chat_history,
  ]
  if additional_tools:
    tools.extend(additional_tools)

  paper_info = f"- [{paper.id}] {paper.title}"
  paper_authors = authors_str(paper)
  if paper_authors:
    paper_info += f" by {paper_authors[:100]}"

  paper_text = _layout_text(paper)
  if paper_text:
    paper_info += f"\n\n## Paper Content\n\n{paper_text}"

  instructions = PAPER_AGENT_INSTRUCTIONS + SYSTEM_PROMPT_SUFFIX.format(
    paper_context=paper_info,
  )

  return Agent(
    name="Paper Assistant",
    instructions=instructions,
    tools=tools,
  )


def create_multi_paper_agent(
  papers: list[Paper],
  additional_tools: list | None = None,
) -> Agent:
  """Create an agent for multi-paper (group) chat.

  Args:
      papers: List of papers in the current context.
      additional_tools: Optional extra tools to bind.

  Returns:
      A configured ``Agent`` instance.
  """
  tools = [
    get_paper_layout,
    view_figures,
    get_annotations,
    get_notes,
    get_citations,
    search_papers,
    semantic_search,
    get_chat_history,
  ]
  if additional_tools:
    tools.extend(additional_tools)

  context_lines = [f"A user is discussing {len(papers)} paper(s):"]
  for p in papers:
    line = f"- [{p.id}] {p.title}"
    p_authors = authors_str(p)
    if p_authors:
      line += f" by {p_authors[:80]}"
    paper_text = _layout_text(p)
    if paper_text:
      line += f"\n\n## Paper Content\n\n{paper_text}"
    context_lines.append(line)

  instructions = MULTI_PAPER_AGENT_INSTRUCTIONS + SYSTEM_PROMPT_SUFFIX.format(
    paper_context="\n".join(context_lines),
  )

  return Agent(
    name="Multi-Paper Assistant",
    instructions=instructions,
    tools=tools,
  )


def create_deep_research_agent(
  additional_tools: list | None = None,
) -> Agent:
  """Create an agent for deep research report generation.

  Args:
      additional_tools: Optional extra tools to bind.

  Returns:
      A configured ``Agent`` instance.
  """
  tools = [
    search_papers,
    semantic_search,
    get_paper_content,
    get_paper_metadata,
    get_citations,
    search_discovery,
    discovery_get_paper_details,
    discovery_get_citations,
    get_references,
    get_recommendations,
    web_search,
    search_authors,
    get_author_works,
  ]
  if additional_tools:
    tools.extend(additional_tools)

  return Agent(
    name="Deep Research Assistant",
    instructions=DEEP_RESEARCH_INSTRUCTIONS,
    tools=tools,
  )
