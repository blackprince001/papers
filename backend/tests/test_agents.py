"""Tests for agent factory functions."""

from __future__ import annotations

from unittest.mock import MagicMock

from app.services.ai.agent.agents import (
  create_deep_research_agent,
  create_multi_paper_agent,
  create_paper_agent,
)


class MockPaper:
  """Minimal Paper mock for testing agents."""

  def __init__(
    self,
    id: int = 1,
    title: str = "Test Paper",
    authors: str = "Test Author",
    layout_blocks: list[dict] | None = None,
  ):
    self.id = id
    self.title = title
    self.authors = authors
    self.layout_blocks = layout_blocks or []


class TestCreatePaperAgent:
  """create_paper_agent factory."""

  def test_agent_created_with_name(self):
    paper = MockPaper()
    agent = create_paper_agent(paper)
    assert agent.name == "Paper Assistant"

  def test_agent_has_tools(self):
    paper = MockPaper()
    agent = create_paper_agent(paper)
    assert len(agent.tools) >= 6

  def test_instructions_contains_paper_title(self):
    paper = MockPaper(id=42, title="Attention Is All You Need")
    agent = create_paper_agent(paper)
    assert "Attention Is All You Need" in agent.instructions
    assert "[42]" in agent.instructions

  def test_instructions_contains_suffix(self):
    paper = MockPaper()
    agent = create_paper_agent(paper)
    assert "Available papers in context:" in agent.instructions

  def test_additional_tools_appended(self):
    paper = MockPaper()
    extra_tool = MagicMock()
    extra_tool.__name__ = "extra_tool"
    agent = create_paper_agent(paper, additional_tools=[extra_tool])
    assert extra_tool in agent.tools


class TestCreateMultiPaperAgent:
  """create_multi_paper_agent factory."""

  def test_agent_created_with_name(self):
    papers = [MockPaper(), MockPaper(id=2, title="Paper 2")]
    agent = create_multi_paper_agent(papers)
    assert agent.name == "Multi-Paper Assistant"

  def test_agent_has_tools(self):
    papers = [MockPaper()]
    agent = create_multi_paper_agent(papers)
    assert len(agent.tools) >= 6

  def test_instructions_contains_all_papers(self):
    papers = [
      MockPaper(id=1, title="Paper One"),
      MockPaper(id=2, title="Paper Two"),
    ]
    agent = create_multi_paper_agent(papers)
    assert "Paper One" in agent.instructions
    assert "Paper Two" in agent.instructions
    assert "2 paper(s)" in agent.instructions

  def test_additional_tools_appended(self):
    papers = [MockPaper()]
    extra_tool = MagicMock()
    extra_tool.__name__ = "extra_tool"
    agent = create_multi_paper_agent(papers, additional_tools=[extra_tool])
    assert extra_tool in agent.tools


class TestCreateDeepResearchAgent:
  """create_deep_research_agent factory."""

  def test_agent_created_with_name(self):
    agent = create_deep_research_agent()
    assert agent.name == "Deep Research Assistant"

  def test_agent_has_tools(self):
    agent = create_deep_research_agent()
    assert len(agent.tools) >= 4

  def test_instructions_are_set(self):
    agent = create_deep_research_agent()
    assert len(agent.instructions) > 100

  def test_additional_tools_appended(self):
    extra_tool = MagicMock()
    extra_tool.__name__ = "extra_tool"
    agent = create_deep_research_agent(additional_tools=[extra_tool])
    assert extra_tool in agent.tools
