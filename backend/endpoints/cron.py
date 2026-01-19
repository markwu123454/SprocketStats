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
    Sends attendance push notifications to all opted-in subscriptions.
    """

    # 1. Fetch subscriptions
    subs = await db.fetch_push_subscriptions_for_setting(
        setting_key="attendance",
        setting_value=True,
    )

    sent = 0
    failed = 0

    # 2. Notification payload (shown by service worker)
    payload = {
        "title": "Attendance Reminder",
        "body": "Please mark your attendance.",
        "url": "/attendance",
    }

    # 3. Send pushes
    for sub in subs:
        try:
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

            # 4. Disable invalid subscriptions
            if e.response and e.response.status_code in (404, 410):
                await db.update_push_subscription(
                    email="*",  # bypass email match for cron
                    endpoint=sub["endpoint"],
                    updates={"enabled": False},
                )

    return {
        "total": len(subs),
        "sent": sent,
        "failed": failed,
    }


