from collections import defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import asyncio
import json
import os

from fastapi import APIRouter, Response, status
from pywebpush import webpush, WebPushException

import db

router = APIRouter()

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@example.com")


async def send_webpush(email: str, sub: dict, payload: dict) -> tuple[bool, bool]:
    """
    Returns:
        (sent, should_disable_subscription)
    """
    try:
        await asyncio.to_thread(
            webpush,
            subscription_info={
                "endpoint": sub["endpoint"],
                "keys": {
                    "p256dh": sub["p256dh"],
                    "auth": sub["auth"],
                },
            },
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_SUBJECT},
            ttl=60 * 60,
        )
        return True, False

    except WebPushException as e:
        disable = bool(
            e.response and e.response.status_code in (404, 410)
        )
        return False, disable


@router.get("/cron/attendance")
async def cron_attendance():
    """
    Sends meeting start / end attendance reminders.
    Called every 15 minutes (±7.5 min tolerance).
    """

    now = datetime.now(timezone.utc)

    meeting = await db.get_latest_meeting_boundaries()
    if not meeting:
        return Response(
            content=(
                "Meeting attendance reminder run complete\n"
                "Sent: 0\n"
                "Failed: 0\n"
                "No meeting boundaries available"
            ),
            media_type="text/plain",
        )

    subs = await db.fetch_push_subscriptions_for_setting(
        setting_key="attendance",
        setting_value=True,
    )

    if not subs:
        return {
            "sent": 0,
            "failed": 0,
            "meeting_start": meeting["start"],
            "meeting_end": meeting["end"],
        }

    subs_by_email: dict[str, list[dict]] = defaultdict(list)
    for sub in subs:
        subs_by_email[sub["email"]].append(sub)

    tasks: list[asyncio.Task] = []

    for email, devices in subs_by_email.items():
        checked_in = await db.is_user_currently_checked_in(
            email=email,
            future_offset_seconds=0,
        )

        payload = None

        if db.is_near(now, meeting["start"]) and not checked_in:
            payload = {
                "title": "Team Sprocket meeting starting",
                "body": "The meeting is about to start. Please check in if you're attending it.",
                "url": "/attendance",
            }

        elif db.is_near(now, meeting["end"]) and checked_in:
            payload = {
                "title": "Team Sprocket meeting ending",
                "body": "The meeting is ending soon. Please check out.",
                "url": "/attendance",
            }

        if not payload:
            continue

        for sub in devices:
            tasks.append(
                asyncio.create_task(send_webpush(email, sub, payload))
            )

    results = await asyncio.gather(*tasks, return_exceptions=False)

    sent = 0
    failed = 0

    cleanup_tasks = []

    for (success, disable), task in zip(results, tasks):
        if success:
            sent += 1
        else:
            failed += 1
            if disable:
                email, sub, _ = task.get_coro().cr_frame.f_locals.values()
                cleanup_tasks.append(
                    db.update_push_subscription(
                        email=email,
                        endpoint=sub["endpoint"],
                        updates={"enabled": False},
                    )
                )

    if cleanup_tasks:
        await asyncio.gather(*cleanup_tasks)

    la_tz = ZoneInfo("America/Los_Angeles")
    start_la = meeting["start"].astimezone(la_tz)
    end_la = meeting["end"].astimezone(la_tz)

    if sent == 0 and failed == 0:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return Response(
        content=(
            "Meeting attendance reminder run complete\n"
            f"Sent: {sent}\n"
            f"Failed: {failed}\n"
            f"Meeting start (LA): {start_la.strftime('%Y-%m-%d %I:%M %p %Z')}\n"
            f"Meeting end   (LA): {end_la.strftime('%Y-%m-%d %I:%M %p %Z')}\n"
        ),
        media_type="text/plain",
    )
