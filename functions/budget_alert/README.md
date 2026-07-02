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
- `get_telegram_credentials` / `get_parameter` – resolve the bot token and chat
  id from SSM Parameter Store, falling back to env vars.
- `get_free_tier_usages` – calls AWS and returns a list of usage dicts.
- `build_report` – turns the usage list into the Telegram message text.
- `alert_items` / `percent` / `format_line` – small helpers.
- `send_telegram_message` – posts the message using `urllib` (no `requests`
  dependency, so the package stays small).

## Credentials

The bot token and chat id are each stored as their own SSM parameter and
resolved independently. For each value:

1. **AWS SSM Parameter Store** – the parameter named by `TELEGRAM_BOT_TOKEN_PARAM`
   / `TELEGRAM_CHAT_ID_PARAM` (defaulting to
   `/<service>/<stage>/telegram/bot-token` and `.../chat-id`). Store the token as
   a `SecureString` (it is fetched with decryption) and the chat id as a plain
   `String`:

   ```powershell
   aws ssm put-parameter --name /aws-automation/dev/telegram/bot-token `
     --type SecureString --value "123456789:AA..."
   aws ssm put-parameter --name /aws-automation/dev/telegram/chat-id `
     --type String --value "123456789"
   ```

   Standard-tier parameters are free, and `SecureString` with the AWS-managed
   `alias/aws/ssm` key has no monthly key charge.

2. **Environment variables** – if a parameter is missing, inaccessible, or its
   env var name is unset, that value falls back to `TELEGRAM_BOT_TOKEN` /
   `TELEGRAM_CHAT_ID`. The fallback is per-value, so you can source one from SSM
   and the other from the environment.

`serverless invoke local` reads the same parameters as the deployed Lambda, so
local runs need AWS credentials that can call `ssm:GetParameter` (unless you
rely purely on the env-var fallback). The Lambda's IAM role only grants
`ssm:GetParameter` on `/<service>/<stage>/telegram/bot-token` and `.../chat-id`
(plus `kms:Decrypt` via the SSM service for the `SecureString` token).

## Other environment variables

```text
FREE_TIER_WARN_PERCENT      (default 10)
FREE_TIER_REPORT_MAX_ITEMS  (default 3)
```

- `FREE_TIER_WARN_PERCENT` is the "Warning" threshold in the summary. With `10`,
  any item using or forecasted to use at least 10% of its limit is counted as a
  warning; at 100% or above it is counted as critical.
- `FREE_TIER_REPORT_MAX_ITEMS` caps the "Highest Usage" section (default 3).

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
