"""Deterministic citation-structure baseline for deep-research evaluations."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).parent


def grade(case: dict[str, object], answer: str) -> dict[str, object]:
  required = [str(value) for value in case["required_provenance"]]
  cited = [value for value in required if f"ref:{value}" in answer]
  return {
    "case_id": case["id"],
    "citation_recall": len(cited) / len(required) if required else 1.0,
    "permission_violation": "ref:paper/99" in answer,
    "unsupported_claims": 0,
  }


def main() -> None:
  config = json.loads((ROOT / "cases.json").read_text())
  results = [grade(case, "") for case in config["cases"]]
  print(json.dumps({"dataset": config["version"], "baseline": results}, indent=2))


if __name__ == "__main__":
  main()
