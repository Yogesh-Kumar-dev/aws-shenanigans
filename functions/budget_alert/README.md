# Budget Alert Lambda

This Lambda sends a daily AWS Free Tier usage report to Telegram.

Every day at 8:00 AM IST, EventBridge invokes the Lambda. It checks your AWS
Free Tier usage, formats a short report, and sends it to your Telegram chat.

Everything lives in one file: `handler.py`.

## How it works

1. EventBridge runs the Lambda on the schedule in `serverless.yml`.
2. AWS calls `functions/budget_alert/handler.handle`.
3. The handler reads env vars, calls the AWS Free Tier API, builds the
   message, and sends it to Telegram.

The functions in `handler.py`:

- `handle` – Lambda entry point (AWS always passes `event` and `context`).
- `get_free_tier_usages` – calls AWS and returns a list of usage dicts.
- `build_report` – turns the usage list into the Telegram message text.
- `alert_items` / `percent` / `format_line` – small helpers.
- `send_telegram_message` – posts the message using `urllib` (no `requests`
  dependency, so the package stays small).

## Environment variables

```text
TELEGRAM_BOT_TOKEN              (required)
TELEGRAM_CHAT_ID               (required)
FREE_TIER_ALERT_LIMIT_PERCENT  (default 10)
FREE_TIER_REPORT_MAX_ITEMS     (default 10)
```

- `FREE_TIER_ALERT_LIMIT_PERCENT` controls the "Needs attention" section. With
  `10`, any item using or forecasted to use at least 10% of its limit is flagged.
- `FREE_TIER_REPORT_MAX_ITEMS` caps the "Top usage" section only. The
  "Needs attention" section always shows every flagged item.

## Local invocation

From the project root:

```powershell
npx serverless invoke local --function budget-alert
```

This runs the real handler, so it needs:

- Local AWS credentials that can call `freetier:GetFreeTierUsage`.
- A real `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in your `.env`.

To see the message formatting without hitting AWS or Telegram, run the tests
instead (see below).

## Tests

```powershell
python -m pytest
```

Tests live in `tests/test_budget_alert.py` and mock the AWS and Telegram calls,
so they never hit the real APIs.
