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

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))


def handle(event, context):
    """Lambda entry point. AWS calls this once per schedule."""
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not bot_token or not chat_id:
        raise ValueError("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set")

    alert_limit_percent = float(os.getenv("FREE_TIER_ALERT_LIMIT_PERCENT", "10"))
    max_items = int(os.getenv("FREE_TIER_REPORT_MAX_ITEMS", "10"))
    region = os.getenv("AWS_REGION", "us-east-1")

    usages = get_free_tier_usages(region)
    message = build_report(usages, alert_limit_percent, max_items)
    send_telegram_message(bot_token, chat_id, message)

    alert_count = len(alert_items(usages, alert_limit_percent))
    logger.info("Sent report: %s items, %s alerts", len(usages), alert_count)
    return {"usage_count": len(usages), "alert_count": alert_count}


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
    return usages


def percent(value, limit):
    """Value as a percentage of limit, safe when limit is zero."""
    if limit <= 0:
        return 0.0
    return round((value / limit) * 100, 2)


def alert_items(usages, alert_limit_percent):
    """Usages at or above the alert threshold (actual or forecast)."""
    flagged = []
    for usage in usages:
        highest_pct = max(usage["actual_pct"], usage["forecast_pct"])
        if highest_pct >= alert_limit_percent:
            flagged.append(usage)
    return flagged


def fmt_num(value):
    """Format a number with thousands separators, no scientific notation."""
    if float(value).is_integer():
        return f"{int(value):,}"
    return f"{round(value, 2):,}"


def status_dot(pct, alert_limit_percent):
    """Pick a colored dot so hot services stand out at a glance."""
    if pct >= 100:
        return "🔴"  # over the free tier limit — this now costs money
    if pct >= alert_limit_percent:
        return "🟡"  # past your alert threshold
    return "🟢"


def format_line(usage, alert_limit_percent):
    """Format one usage item as two readable lines with a status dot."""
    dot = status_dot(max(usage["actual_pct"], usage["forecast_pct"]), alert_limit_percent)
    service = html.escape(usage["service"])
    unit = html.escape(usage["unit"])
    return (
        f"{dot} <b>{service}</b> · {unit}\n"
        f"    {usage['actual_pct']:g}% used · {usage['forecast_pct']:g}% forecast "
        f"({fmt_num(usage['actual'])}/{fmt_num(usage['limit'])})"
    )


def build_report(usages, alert_limit_percent, max_items):
    """Build the Telegram message text (HTML) from the usage list."""
    today = datetime.now().strftime("%d %b %Y")
    title = f"📊 <b>AWS Free Tier — Daily Report</b>\n<i>{today}</i>"

    if not usages:
        return f"{title}\n\nNo Free Tier usage returned for this account."

    flagged = alert_items(usages, alert_limit_percent)
    top = sorted(
        usages,
        key=lambda u: max(u["actual_pct"], u["forecast_pct"]),
        reverse=True,
    )[:max_items]

    lines = [
        title,
        "",
        f"Tracked items: <b>{len(usages)}</b>  ·  "
        f"Above {alert_limit_percent:g}%: <b>{len(flagged)}</b>",
        "",
        "🔝 <b>Top usage</b>",
    ]
    lines.extend(format_line(u, alert_limit_percent) for u in top)

    if flagged:
        lines.extend(["", "⚠️ <b>Needs attention</b>"])
        lines.extend(format_line(u, alert_limit_percent) for u in flagged)

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
