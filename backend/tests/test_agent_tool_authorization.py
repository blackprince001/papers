"""Tenant-scope tests for the AI agent paper boundary."""

from __future__ import annotations

import json

from agents.tool_context import ToolContext
from app.models.paper import Paper
from app.services.access import apply_agent_paper_visibility_filter
from app.services.ai.agent.context import BYOContext, set_byo_context
from app.services.ai.agent.tools.paper_tools import get_paper_content
from sqlalchemy import create_engine, select, text


class _EmptyResult:
  def scalars(self):
    return self

  def all(self):
    return []


class _CaptureDB:
  def __init__(self):
    self.queries = []

  async def execute(self, query, *args):
    self.queries.append(query)
    return _EmptyResult()


def _scope_engine():
  engine = create_engine("sqlite://")
  with engine.begin() as conn:
    conn.exec_driver_sql("CREATE TABLE papers (id INTEGER PRIMARY KEY, uploaded_by_id INTEGER)")
    conn.exec_driver_sql("CREATE TABLE paper_shares (paper_id INTEGER, recipient_id INTEGER, permission TEXT)")
    conn.exec_driver_sql("CREATE TABLE groups (id INTEGER PRIMARY KEY, parent_id INTEGER)")
    conn.exec_driver_sql("CREATE TABLE group_shares (group_id INTEGER, recipient_id INTEGER, permission TEXT)")
    conn.exec_driver_sql("CREATE TABLE paper_groups (paper_id INTEGER, group_id INTEGER)")
    conn.execute(text("INSERT INTO papers VALUES (1, 1), (2, 2), (3, NULL), (4, 99), (5, 99)"))
    conn.execute(text("INSERT INTO paper_shares VALUES (4, 2, 'editor')"))
    conn.execute(text("INSERT INTO groups VALUES (10, NULL), (11, 10)"))
    conn.execute(text("INSERT INTO group_shares VALUES (10, 2, 'viewer')"))
    conn.execute(text("INSERT INTO paper_groups VALUES (5, 11)"))
  return engine


def _visible_ids(engine, user_id: int):
  query = apply_agent_paper_visibility_filter(select(Paper.id), user_id)
  with engine.connect() as conn:
    return set(conn.execute(query).scalars())


def test_owner_shared_editor_group_share_and_orphan_scopes():
  engine = _scope_engine()
  try:
    assert _visible_ids(engine, 1) == {1}
    assert _visible_ids(engine, 2) == {2, 4, 5}
    assert _visible_ids(engine, 3) == set()
  finally:
    engine.dispose()


def test_agent_scope_fails_closed_without_identity_and_admin_bypasses():
  engine = _scope_engine()
  try:
    no_identity = apply_agent_paper_visibility_filter(select(Paper.id), None)
    admin = apply_agent_paper_visibility_filter(select(Paper.id), None, is_admin=True)
    with engine.connect() as conn:
      assert set(conn.execute(no_identity).scalars()) == set()
      assert set(conn.execute(admin).scalars()) == {1, 2, 3, 4, 5}
  finally:
    engine.dispose()


async def test_content_tool_uses_fail_closed_scope_without_identity():
  db = _CaptureDB()
  set_byo_context(BYOContext(user_id=None, extra={"db_session": db}))
  try:
    payload = json.dumps({"paper_ids": [1]})
    context = ToolContext(
      context=None,
      tool_name=get_paper_content.name,
      tool_arguments=payload,
      tool_call_id="authorization-test",
    )
    result = await get_paper_content.on_invoke_tool(context, payload)
    assert result == "No accessible papers found."
    assert "false" in str(db.queries[0]).lower()
  finally:
    set_byo_context(BYOContext())
