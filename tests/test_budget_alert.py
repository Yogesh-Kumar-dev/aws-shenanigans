"""Tests for the budget alert Lambda."""

from functions.budget_alert import handler

USAGES = [
    {
        "service": "Amazon EC2",
        "actual": 620.0,
        "forecast": 900.0,
        "limit": 750.0,
        "actual_pct": 82.67,
        "forecast_pct": 120.0,
        "unit": "Hrs",
        "region": "global",
        "type": "12 Months Free",
    }
]


def test_percent_handles_zero_limit():
    assert handler.percent(50, 100) == 50
    assert handler.percent(10, 0) == 0.0


def test_alert_items_flags_forecasted_usage():
    flagged = handler.alert_items(USAGES, alert_limit_percent=10)
    assert len(flagged) == 1


def test_build_report_includes_service_name():
    message = handler.build_report(USAGES, alert_limit_percent=10, max_items=5)
    assert "AWS Free Tier" in message
    assert "Amazon EC2" in message
    assert "Needs attention" in message


def test_handler_sends_daily_report(monkeypatch):
    sent = []

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "chat")
    monkeypatch.setattr(handler, "get_free_tier_usages", lambda region: USAGES)
    monkeypatch.setattr(
        handler, "send_telegram_message", lambda token, chat, text: sent.append(text)
    )

    response = handler.handle({}, None)

    assert response == {"usage_count": 1, "alert_count": 1}
    assert len(sent) == 1
    assert "AWS Free Tier" in sent[0]
