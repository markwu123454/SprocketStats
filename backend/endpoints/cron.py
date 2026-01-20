from collections import defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Response
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

    now = datetime.now(timezone.utc)

    meeting = await db.get_latest_meeting_boundaries()
    if not meeting:
        return Response(
            content=(
                f"Meeting attendance reminder run complete\n"
                f"Sent: 0\n"
                f"Failed: 0\n"
                f"No meeting boundaries available"
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

    # Group subscriptions by user (email)
    subs_by_email: dict[str, list[dict]] = defaultdict(list)
    for sub in subs:
        subs_by_email[sub["email"]].append(sub)

    sent = 0
    failed = 0

    for email, devices in subs_by_email.items():
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

        for sub in devices:
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

                # Clean up dead subscriptions
                if e.response and e.response.status_code in (404, 410):
                    await db.update_push_subscription(
                        email=email,
                        endpoint=sub["endpoint"],
                        updates={"enabled": False},
                    )

    la_tz = ZoneInfo("America/Los_Angeles")

    start_la = meeting["start"].astimezone(la_tz)
    end_la = meeting["end"].astimezone(la_tz)

    return Response(
        content=(
            f"Meeting attendance reminder run complete\n"
            f"Sent: {sent}\n"
            f"Failed: {failed}\n"
            f"Meeting start (LA): {start_la.strftime('%Y-%m-%d %I:%M %p %Z')}\n"
            f"Meeting end   (LA): {end_la.strftime('%Y-%m-%d %I:%M %p %Z')}\n"
        ),
        media_type="text/plain",
    )

