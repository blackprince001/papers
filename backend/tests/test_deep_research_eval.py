from evals.deep_research.v1.run_eval import evaluate, release_failures


def test_release_fixture_beats_empty_baseline():
  import json
  from pathlib import Path

  root = Path(__file__).parents[1] / "evals" / "deep_research" / "v1"
  config = json.loads((root / "cases.json").read_text())
  answers = json.loads((root / "release-candidate-answers.json").read_text())
  candidate = evaluate(config, answers)
  baseline = evaluate(config, {case["id"]: "" for case in config["cases"]})
  assert release_failures(config, candidate, baseline) == []
  assert candidate["summary"]["permission_violations"] == 0


def test_release_gate_hard_fails_permission_violation():
  config = {
    "version": "test",
    "release_thresholds": {"permission_violations": 0},
    "cases": [{"id": "private", "required_provenance": [], "forbidden_provenance": ["paper/99"]}],
  }
  result = evaluate(config, {"private": "ref:paper/99"})
  assert release_failures(config, result) == ["permission violations must remain zero"]
