"""Daily start/stop of an EC2 instance, resolved by domain name."""

import logging
import os
import socket
from datetime import datetime, timedelta, timezone

import boto3

IST = timezone(timedelta(hours=5, minutes=30))

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))


def handle(event, context):
    """Lambda entry point. AWS calls this once per schedule (start or stop)."""
    action = event.get("action")
    if action not in ("start", "stop"):
        raise ValueError(f"Unknown action {action!r}; expected 'start' or 'stop'")

    region = os.getenv("AWS_REGION", "us-east-1")
    domain = os.getenv("EC2_DOMAIN")
    if not domain:
        raise ValueError("EC2_DOMAIN must be set to the instance's domain name")

    ec2 = boto3.client("ec2", region_name=region)
    instance_id = resolve_instance_id(ec2, domain)

    if action == "start":
        ec2.start_instances(InstanceIds=[instance_id])
    else:
        ec2.stop_instances(InstanceIds=[instance_id])

    verb = "started" if action == "start" else "stopped"
    now_ist = datetime.now(timezone.utc).astimezone(IST).strftime("%Y-%m-%d %H:%M:%S IST")
    logger.info("EC2 instance %s %s successfully at %s", instance_id, verb, now_ist)
    return {"action": action, "instance_id": instance_id, "timestamp": now_ist}


def resolve_instance_id(ec2_client, domain):
    """Resolve a domain to its current IP, then find the matching EC2 instance.

    The Elastic IP stays associated with the instance even while stopped, so
    this lookup works regardless of the instance's current state.
    """
    ip = socket.gethostbyname(domain)

    response = ec2_client.describe_instances(
        Filters=[{"Name": "ip-address", "Values": [ip]}]
    )
    instances = [
        instance
        for reservation in response["Reservations"]
        for instance in reservation["Instances"]
    ]

    if len(instances) != 1:
        raise ValueError(
            f"Expected exactly 1 instance for {domain} ({ip}), found {len(instances)}"
        )

    return instances[0]["InstanceId"]
