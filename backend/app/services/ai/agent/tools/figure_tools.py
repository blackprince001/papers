"""Function tool for analyzing a paper's figures.

Renders each figure region from the PDF to a PNG and sends it to the user's
provider as an image (OpenAI-compatible vision format), returning a text
description. This lets the chat agent reason about figure content even when
the *chat* model is text-only — the description is produced by a vision call
and returned as text. If the provider's model cannot accept images, the tool
falls back to the figures' captions.
"""

from __future__ import annotations

# OpenAI Agents SDK — optional dependency
try:
  from agents import function_tool
except ImportError:
  def function_tool(f):
    return f  # type: ignore[assignment]

from app.core.logger import get_logger
from app.services.ai.agent.context import get_byo_context
from app.services.ai.agent.tools import rollback_quietly, with_timeout
from app.services.figure_service import (
  MAX_FIGURES,
  list_figures,
  render_figure_data_url,
  resolve_pdf_path,
)

logger = get_logger(__name__)

_VISION_PROMPT = (
  "Describe this figure from a research paper in 2-4 sentences. Capture the "
  "type of visual (plot, diagram, table, photo), the variables/axes or "
  "components shown, and the main trend or takeaway. Be specific and factual."
)


def _vision_client_and_model():
  """Build an AsyncOpenAI client + model name from the active BYO provider.

  Returns ``(None, None)`` when the configured provider is known to be
  text-only (DeepSeek, Ollama, vLLM, and custom endpoints without vision).
  """
  ctx = get_byo_context()
  configs = ctx.provider_configs or []
  if not configs:
    return None, None

  from openai import AsyncOpenAI

  from app.services.ai.agent.multi_provider import PROVIDER_DEFAULTS

  cfg = configs[0]
  # Skip vision for known text-only providers
  if cfg.provider_type in ("deepseek", "ollama", "vllm", "openai-compatible"):
    return None, None

  defaults = PROVIDER_DEFAULTS.get(cfg.provider_type, {})
  base_url = cfg.base_url or defaults.get("base_url") or None
  api_key = cfg.api_key or defaults.get("api_key", "")
  model = cfg.default_model or "gpt-4o"
  client = AsyncOpenAI(api_key=api_key, base_url=base_url)
  return client, model


@function_tool
@with_timeout(120)
async def view_figures(paper_id: int) -> str:
  """Analyze the figures in a paper and return text descriptions of each.

  Renders every figure from the paper's PDF and uses a vision model to
  describe what each one shows (plots, diagrams, tables, etc.). Use this when
  the user asks about figures, charts, diagrams, or what a specific figure
  depicts.

  Args:
      paper_id: The unique ID of the paper in the user's library.

  Returns:
      A formatted list of figure descriptions (with captions and page numbers).
  """
  ctx = get_byo_context()
  db = ctx.extra.get("db_session")
  user_id = ctx.user_id
  is_admin = ctx.is_admin

  if not db:
    return "Error: No database session available."

  try:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.paper import Paper
    from app.services.access import apply_agent_paper_visibility_filter

    query = apply_agent_paper_visibility_filter(
      select(Paper)
      .where(Paper.id == paper_id)
      .options(selectinload(Paper.tags), selectinload(Paper.groups)),
      user_id,
      is_admin=is_admin,
    )
    paper = (await db.execute(query)).scalar_one_or_none()
    if not paper:
      return "Paper not found or not accessible."

    figures = list_figures(paper.layout_blocks)
    if not figures:
      return (
        f"No figures were detected in the layout of '{paper.title}'. The paper "
        "may be text-only or its layout was not extracted."
      )

    pdf_path = resolve_pdf_path(paper.file_path)
    figures = figures[:MAX_FIGURES]

    client, model = _vision_client_and_model()

    lines = [f"Figures in '{paper.title}':\n"]
    vision_failed = False

    for idx, fig in enumerate(figures, 1):
      page = fig.get("page")
      caption = fig.get("caption") or ""
      header = f"Figure {idx} (page {page})" if page else f"Figure {idx}"

      description = ""
      # Prefer the base64 image captured at extraction time; fall back to
      # rendering from the PDF for papers extracted before that was added.
      data_url = fig.get("image")
      if not data_url and pdf_path and fig.get("bbox") and page:
        data_url = render_figure_data_url(pdf_path, page, fig["bbox"])

      if data_url and client and not vision_failed:
        try:
          resp = await client.chat.completions.create(
            model=model,
            max_tokens=400,
            messages=[
              {
                "role": "user",
                "content": [
                  {"type": "text", "text": _VISION_PROMPT},
                  {"type": "image_url", "image_url": {"url": data_url}},
                ],
              }
            ],
          )
          description = (resp.choices[0].message.content or "").strip()
        except Exception as e:  # noqa: BLE001 — model may not support vision
          logger.info(
            "Vision describe failed; falling back to captions",
            paper_id=paper_id,
            error=str(e)[:150],
          )
          # Stop trying vision for the rest — the model clearly can't do it.
          vision_failed = True

      lines.append(header)
      if caption:
        lines.append(f"  Caption: {caption}")
      if description:
        lines.append(f"  Description: {description}")
      elif not caption:
        lines.append("  (no caption or description available)")
      lines.append("")

    if vision_failed and not any("Description:" in ln for ln in lines):
      lines.append(
        "Note: the current AI model could not analyze figure images, so only "
        "captions are shown. Configure a vision-capable model to see figure "
        "contents."
      )

    return "\n".join(lines).strip()

  except Exception as e:
    await rollback_quietly(db)
    logger.error("Error in view_figures", paper_id=paper_id, error=str(e))
    return f"Error analyzing figures: {str(e)[:200]}"
