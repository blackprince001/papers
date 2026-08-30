from app.services.deep_research import telemetry


def test_metrics_keep_only_bounded_operational_fields(monkeypatch):
  calls = []

  class Logger:
    def info(self, event, **fields):
      calls.append((event, fields))

  monkeypatch.setattr(telemetry, "logger", Logger())
  telemetry.record_metric(
    "run_terminal",
    status="completed",
    provider_type="openai",
    question="do not record this",
    session_id=42,
    report="do not record this either",
    source_count=3,
  )

  assert calls == [
    (
      "deep_research_metric",
      {"metric": "run_terminal", "status": "completed", "provider_type": "openai", "source_count": 3},
    )
  ]
