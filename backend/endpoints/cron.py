from datetime import datetime
from fastapi import APIRouter, HTTPException
from pywebpush import webpush, WebPushException
import json
import os

import db

router = APIRouter()

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@example.com")


@router.get("/cron/attendance")
async def cron_attendance():
    """
    Sends meeting start / end attendance reminders.
    Called every 15 minutes (±7.5 min tolerance).
    """

    now = datetime.utcnow()

    meeting = await db.get_current_meeting_times()
    if not meeting:
        raise HTTPException(500, "Meeting times not configured")

    subs = await db.fetch_push_subscriptions_for_setting(
        setting_key="attendance",
        setting_value=True,
    )

    sent = 0
    failed = 0

    for sub in subs:
        email = sub["email"]

        try:
            checked_in = await db.is_user_currently_checked_in(
                email=email,
                future_offset_seconds=0,
            )

            payload = None

            # Near meeting start → only if NOT checked in
            if db.is_near(now, meeting["start"]) and not checked_in:
                payload = {
                    "title": "Team Sprocket meeting starting",
                    "body": "The meeting is about to start. Please check in if you're attending it.",
                    "url": "/attendance",
                }

            # Near meeting end → only if STILL checked in
            elif db.is_near(now, meeting["end"]) and checked_in:
                payload = {
                    "title": "Team Sprocket meeting ending",
                    "body": "The meeting is ending soon. Please check out.",
                    "url": "/attendance",
                }

            if not payload:
                continue

            webpush(
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

            sent += 1

        except WebPushException as e:
            failed += 1

            if e.response and e.response.status_code in (404, 410):
                await db.update_push_subscription(
                    email="*",
                    endpoint=sub["endpoint"],
                    updates={"enabled": False},
                )

    return {
        "sent": sent,
        "failed": failed,
        "meeting_start": meeting["start"],
        "meeting_end": meeting["end"],
    }
