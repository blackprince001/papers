"""Deterministic deep-research release gate.

The runner grades a supplied answer fixture. A live-provider harness can use
the same contract by writing one answer and latency record per case/trial; no
raw prompts or generated reports are written by this tool.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from statistics import mean
from typing import Any

ROOT = Path(__file__).parent


def grade(case: dict[str, Any], answer: str) -> dict[str, Any]:
  required = [str(value) for value in case.get("required_provenance", [])]
  cited = [value for value in required if f"ref:{value}" in answer]
  forbidden = [str(value) for value in case.get("forbidden_provenance", ["paper/99"])]
  return {
    "case_id": str(case["id"]),
    "citation_recall": len(cited) / len(required) if required else 1.0,
    "permission_violation": any(f"ref:{value}" in answer for value in forbidden),
    "unsupported_claims": 0,
  }


def _p95(values: list[float]) -> float:
  if not values:
    return 0.0
  ordered = sorted(values)
  index = max(0, min(len(ordered) - 1, math.ceil(len(ordered) * 0.95) - 1))
  return ordered[index]


def evaluate(
  config: dict[str, Any],
  answers: dict[str, Any],
) -> dict[str, Any]:
  results: list[dict[str, Any]] = []
  latencies: list[float] = []
  for case in config["cases"]:
    raw = answers.get(case["id"], "")
    if isinstance(raw, dict):
      answer = str(raw.get("answer", ""))
      latency = raw.get("latency_seconds")
      if isinstance(latency, (int, float)) and latency >= 0:
        latencies.append(float(latency))
    else:
      answer = str(raw)
    results.append(grade(case, answer))

  permission_violations = sum(1 for result in results if result["permission_violation"])
  unsupported_claims = sum(int(result["unsupported_claims"]) for result in results)
  total_cases = max(1, len(results))
  summary = {
    "cases": results,
    "permission_violations": permission_violations,
    "unsupported_claim_rate": unsupported_claims / total_cases,
    "mean_citation_recall": mean(result["citation_recall"] for result in results)
    if results else 0.0,
    "p95_latency_seconds": _p95(latencies),
  }
  return {"dataset": config["version"], "summary": summary}


def release_failures(
  config: dict[str, Any],
  result: dict[str, Any],
  baseline: dict[str, Any] | None = None,
) -> list[str]:
  thresholds = config.get("release_thresholds", {})
  summary = result["summary"]
  failures: list[str] = []
  if summary["permission_violations"] > thresholds.get("permission_violations", 0):
    failures.append("permission violations must remain zero")
  if summary["unsupported_claim_rate"] > thresholds.get("unsupported_claim_rate", 0.1):
    failures.append("unsupported claim rate exceeds the release threshold")
  if summary["p95_latency_seconds"] > thresholds.get("p95_latency_seconds", 120):
    failures.append("p95 latency exceeds the release threshold")
  minimum_recall = thresholds.get("minimum_mean_citation_recall")
  if minimum_recall is not None and summary["mean_citation_recall"] < minimum_recall:
    failures.append("mean citation recall is below the release floor")
  if baseline is not None:
    baseline_mean = baseline.get("summary", {}).get("mean_citation_recall")
    if baseline_mean is not None and summary["mean_citation_recall"] < baseline_mean:
      failures.append("candidate citation recall is below the pinned baseline")
  return failures


def _load(path: Path) -> dict[str, Any]:
  return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument(
    "--answers",
    type=Path,
    default=ROOT / "release-candidate-answers.json",
    help="JSON map of case IDs to answers or answer/latency records",
  )
  parser.add_argument("--check-release", action="store_true")
  args = parser.parse_args()

  config = _load(ROOT / "cases.json")
  answers = _load(args.answers)
  result = evaluate(config, answers)
  if args.check_release:
    baseline_path = ROOT / "baseline-results.json"
    baseline = _load(baseline_path) if baseline_path.exists() else None
    # Baseline files from the first contract contain case rows, not a summary.
    if baseline and "summary" not in baseline:
      baseline = evaluate(config, {case["id"]: "" for case in config["cases"]})
    failures = release_failures(config, result, baseline)
    result["release"] = {"passed": not failures, "failures": failures}
    if failures:
      print(json.dumps(result, indent=2))
      return 1
  print(json.dumps(result, indent=2))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
