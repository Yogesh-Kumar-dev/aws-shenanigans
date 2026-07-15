"""Daily AWS Free Tier usage report, sent to Telegram."""

import html
import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))


def handle(event, context):
    """Lambda entry point. AWS calls this once per schedule."""
    region = os.getenv("AWS_REGION", "us-east-1")

    bot_token, chat_id = get_telegram_credentials(region)
    if not bot_token or not chat_id:
        raise ValueError(
            "Telegram bot token and chat id must be set "
            "(via SSM Parameter Store or environment variables)"
        )

    warn_percent = float(os.getenv("FREE_TIER_WARN_PERCENT", "10"))
    max_items = int(os.getenv("FREE_TIER_REPORT_MAX_ITEMS", "3"))
    credit_warn_usd = float(os.getenv("FREE_TIER_CREDIT_WARN_USD", "50"))

    usages = get_free_tier_usages(region)
    credit_balance = get_credit_balance(region)
    message = build_report(usages, warn_percent, max_items, credit_balance, credit_warn_usd)
    send_telegram_message(bot_token, chat_id, message)

    alert_count = len(alert_items(usages, warn_percent))
    logger.info("Sent report: %s items, %s alerts", len(usages), alert_count)
    return {"usage_count": len(usages), "alert_count": alert_count}


def get_telegram_credentials(region):
    """Resolve Telegram credentials from SSM Parameter Store.

    Looks up the parameters specified by TELEGRAM_BOT_TOKEN_PARAM and
    TELEGRAM_CHAT_ID_PARAM. If either parameter is unavailable, falls back
    to the corresponding environment variable.
    """
    bot_token = get_parameter(
        os.getenv("TELEGRAM_BOT_TOKEN_PARAM"),
        region,
        decrypt=True,
    ) or os.getenv("TELEGRAM_BOT_TOKEN")

    chat_id = get_parameter(
        os.getenv("TELEGRAM_CHAT_ID_PARAM"),
        region,
    ) or os.getenv("TELEGRAM_CHAT_ID")

    return bot_token, chat_id


def get_parameter(param_name, region, decrypt=False):
    """Fetch a single SSM parameter.

    Returns the parameter value or None if it cannot be retrieved.
    """
    if not param_name:
        return None

    try:
        client = boto3.client("ssm", region_name=region)
        response = client.get_parameter(
            Name=param_name,
            WithDecryption=decrypt,
        )
        return response["Parameter"]["Value"]

    except ClientError as exc:
        # AWS answered but rejected the request (missing param, denied, etc.).
        logger.warning(
            "Could not read parameter %s (%s)",
            param_name,
            exc.response.get("Error", {}).get("Code", "unknown"),
        )
        return None
    except BotoCoreError as exc:
        # Never reached AWS: no credentials, no region, network failure, etc.
        logger.warning("Could not read parameter %s (%s)", param_name, exc)
        return None


def get_free_tier_usages(region):
    """Call the AWS Free Tier API and return a list of usage dicts."""
    client = boto3.client("freetier", region_name=region)
    paginator = client.get_paginator("get_free_tier_usage")

    usages = []
    for page in paginator.paginate():
        for item in page.get("freeTierUsages", []):
            actual = float(item.get("actualUsageAmount", 0.0))
            forecast = float(item.get("forecastedUsageAmount", 0.0))
            limit = float(item.get("limit", 0.0))
            usages.append(
                {
                    "service": item.get("service", "Unknown service"),
                    "actual": actual,
                    "forecast": forecast,
                    "limit": limit,
                    "actual_pct": percent(actual, limit),
                    "forecast_pct": percent(forecast, limit),
                    "unit": item.get("unit", ""),
                    "region": item.get("region", "global"),
                    "type": item.get("freeTierType", "Free Tier"),
                }
            )

    logger.info("Free Tier API returned %s line item(s)", len(usages))
    for usage in usages:
        logger.debug(
            "usage item: service=%r unit=%r limit=%s type=%r",
            usage["service"],
            usage["unit"],
            usage["limit"],
            usage["type"],
        )

    ec2_like = [
        u for u in usages if "ec2" in u["service"].lower() or "compute" in u["service"].lower()
    ]
    if ec2_like:
        logger.info(
            "EC2-like line items found: %s",
            [(u["service"], u["unit"], u["limit"]) for u in ec2_like],
        )
    else:
        logger.info(
            "No EC2-like line items in Free Tier API response "
            "(this is expected for non-t2.micro/t3.micro instance types, "
            "or once your account's 12-month Free Tier window has expired)"
        )

    return usages


def get_credit_balance(region):
    """Fetch the account's remaining Free Tier credit balance and expiration.

    Newer AWS accounts run on the credit-based Free Tier plan ($200 total,
    6-month expiry) instead of the legacy per-service 12-month/hours model, so
    remaining credits (not EC2 hours) is what actually determines when this
    account starts paying. Returns None if the account isn't on this plan.
    """
    client = boto3.client("freetier", region_name=region)
    try:
        response = client.get_account_plan_state()
    except (ClientError, BotoCoreError) as exc:
        logger.warning("Could not fetch Free Tier credit balance (%s)", exc)
        return None

    remaining = response.get("accountPlanRemainingCredits") or {}
    if "amount" not in remaining:
        return None

    return {
        "remaining": float(remaining["amount"]),
        "unit": remaining.get("unit", "USD"),
        "status": response.get("accountPlanStatus"),
        "expiration": response.get("accountPlanExpirationDate"),
    }


def percent(value, limit):
    """Value as a percentage of limit, safe when limit is zero."""
    if limit <= 0:
        return 0.0
    return round((value / limit) * 100, 2)


def highest_pct(usage):
    """The worst of actual and forecast usage, so hot services surface."""
    return max(usage["actual_pct"], usage["forecast_pct"])


def alert_items(usages, warn_percent):
    """Usages at or above the warning threshold (actual or forecast)."""
    return [u for u in usages if highest_pct(u) >= warn_percent]


def fmt_num(value):
    """Format a number with thousands separators, no scientific notation."""
    if float(value).is_integer():
        return f"{int(value):,}"
    return f"{round(value, 2):,}"


DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━"


def status_dot(pct, warn_percent):
    """Pick a colored dot so hot services stand out at a glance."""
    if pct >= 100:
        return "🔴"  # over the free tier limit — this now costs money
    if pct >= warn_percent:
        return "🟡"  # approaching the limit
    return "🟢"


def format_line(usage, warn_percent):
    """Format one usage item as two lines: dot + name, then usage detail."""
    pct = highest_pct(usage)
    dot = status_dot(pct, warn_percent)
    service = html.escape(usage["service"])
    return (
        f"{dot} <b>{service}</b>\n"
        f"   {pct:g}% ({fmt_num(usage['actual'])} / {fmt_num(usage['limit'])})"
    )


def build_report(usages, warn_percent, max_items, credit_balance=None, credit_warn_usd=50.0):
    """Build the Telegram message text (HTML) from the usage list."""
    today = datetime.now().strftime("%d %b %Y")
    title = f"📊 <b>AWS Free Tier Report</b>\n🗓️ {today}"

    if not usages:
        return f"{title}\n\n{DIVIDER}\n\nNo Free Tier usage returned for this account."

    critical = [u for u in usages if highest_pct(u) >= 100]
    warning = [u for u in usages if warn_percent <= highest_pct(u) < 100]
    healthy = len(usages) - len(critical) - len(warning)

    top = sorted(usages, key=highest_pct, reverse=True)[:max_items]

    lines = [
        title,
        "",
        DIVIDER,
        "",
        f"🟢 Healthy: {healthy}/{len(usages)} services",
        f"🟡 Warning (>{warn_percent:g}%): {len(warning)}",
        "🔴 Critical (>100%): " + str(len(critical)),
        "",
        DIVIDER,
        "",
    ]

    if credit_balance is not None:
        remaining = credit_balance["remaining"]
        if credit_balance["status"] != "ACTIVE" or remaining <= 0:
            dot = "🔴"
        elif remaining <= credit_warn_usd:
            dot = "🟡"
        else:
            dot = "🟢"

        expires = credit_balance.get("expiration")
        expires_str = expires.strftime("%d %b %Y") if hasattr(expires, "strftime") else str(expires)

        lines.extend(
            [
                "💳 <b>Free Tier Credit Balance</b>",
                (
                    f"   {dot} ${fmt_num(remaining)} {credit_balance['unit']} remaining"
                    f" · expires {expires_str}"
                ),
                "",
                DIVIDER,
                "",
            ]
        )

    lines.extend(
        [
            "🏆 <b>Highest Usage</b>",
            "",
        ]
    )
    lines.append("\n\n".join(format_line(u, warn_percent) for u in top))
    lines.extend(["", DIVIDER, ""])

    if critical:
        lines.append(
            f"🔴 <b>Action needed</b> — {len(critical)} service(s) over the free tier limit."
        )
    elif warning:
        lines.append(f"🟡 {len(warning)} service(s) approaching the limit.")
    else:
        lines.append("✅ Everything looks good today.")

    return "\n".join(lines)


def send_telegram_message(bot_token, chat_id, text):
    """Send a text message to Telegram using the standard library."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    data = urllib.parse.urlencode(
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": "true",
        }
    ).encode("utf-8")
    request = urllib.request.Request(url, data=data, method="POST")

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8")
        raise RuntimeError(f"Telegram API returned HTTP {exc.code}: {error_body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Telegram API request failed: {exc.reason}") from exc

    result = json.loads(body)
    if not result.get("ok"):
        raise RuntimeError(f"Telegram API returned an error: {result}")
