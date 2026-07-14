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
    flagged = handler.alert_items(USAGES, warn_percent=80)
    assert len(flagged) == 1


def test_build_report_includes_service_name():
    message = handler.build_report(USAGES, warn_percent=80, max_items=3)
    assert "AWS Free Tier" in message
    assert "Amazon EC2" in message
    assert "Highest Usage" in message
    # EC2 forecast is 120% -> counts as critical, footer flags action.
    assert "Critical (>100%): 1" in message
    assert "Action needed" in message


def test_build_report_includes_credit_balance_when_provided():
    credit_balance = {
        "remaining": 154.18,
        "unit": "USD",
        "status": "ACTIVE",
        "expiration": "2026-12-30T13:55:00.820000+00:00",
    }
    message = handler.build_report(
        USAGES, warn_percent=80, max_items=3, credit_balance=credit_balance, credit_warn_usd=50.0
    )
    assert "Free Tier Credit Balance" in message
    assert "$154.18 USD remaining" in message


def test_get_credentials_prefers_parameter_store(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN_PARAM", "/aws-automation/dev/telegram/bot-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID_PARAM", "/aws-automation/dev/telegram/chat-id")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "env-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "env-chat")
    params = {
        "/aws-automation/dev/telegram/bot-token": "param-token",
        "/aws-automation/dev/telegram/chat-id": "param-chat",
    }
    monkeypatch.setattr(handler, "get_parameter", lambda name, region, decrypt=False: params.get(name))

    assert handler.get_telegram_credentials("us-east-1") == ("param-token", "param-chat")


def test_get_credentials_falls_back_to_env_per_value(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN_PARAM", "/aws-automation/dev/telegram/bot-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID_PARAM", "/aws-automation/dev/telegram/chat-id")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "env-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "env-chat")
    # Only the token parameter resolves; chat id falls back to the env var.
    monkeypatch.setattr(
        handler,
        "get_parameter",
        lambda name, region, decrypt=False: "param-token" if name.endswith("bot-token") else None,
    )

    assert handler.get_telegram_credentials("us-east-1") == ("param-token", "env-chat")


def test_get_parameter_returns_none_without_name(monkeypatch):
    # No param name configured -> no SSM call, returns None so env var wins.
    assert handler.get_parameter(None, "us-east-1") is None
    assert handler.get_parameter("", "us-east-1") is None


def test_get_parameter_returns_none_on_aws_failure(monkeypatch):
    from botocore.exceptions import NoCredentialsError

    def boom(*args, **kwargs):
        raise NoCredentialsError()

    # A missing-credentials failure (BotoCoreError) must fall through to None,
    # not propagate, so the env-var fallback still works locally.
    monkeypatch.setattr(handler.boto3, "client", boom)
    assert handler.get_parameter("/aws-automation/dev/telegram/bot-token", "us-east-1") is None


def test_handler_sends_daily_report(monkeypatch):
    sent = []

    monkeypatch.delenv("TELEGRAM_BOT_TOKEN_PARAM", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID_PARAM", raising=False)
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "chat")
    monkeypatch.setattr(handler, "get_free_tier_usages", lambda region: USAGES)
    monkeypatch.setattr(handler, "get_credit_balance", lambda region: None)
    monkeypatch.setattr(
        handler, "send_telegram_message", lambda token, chat, text: sent.append(text)
    )

    response = handler.handle({}, None)

    assert response == {"usage_count": 1, "alert_count": 1}
    assert len(sent) == 1
    assert "AWS Free Tier" in sent[0]
