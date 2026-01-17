from fastapi import Depends, HTTPException, APIRouter
import enums, db

router = APIRouter()


@router.post("/push/subscribe")
async def subscribe_push_notification(
        payload: dict,
        session: enums.SessionInfo = Depends(db.require_session()),
):
    """
    Expected payload shape (validated later in DB layer):

    {
      "subscription": {
        "endpoint": "...",
        "keys": {
          "p256dh": "...",
          "auth": "..."
        }
      },
      "os": "iOS" | "Android" | "Windows" | "macOS" | "Linux" | "Other",
      "browser": "Chrome" | "Safari" | "Firefox" | "Edge" | "Other",
      "deviceType": "mobile" | "tablet" | "desktop",
      "isPWA": boolean,
      "isIOSPWA": boolean
    }
    """

    try:
        # Minimal structural sanity check
        sub = payload.get("subscription") or {}
        if not sub.get("endpoint"):
            raise ValueError("Missing push subscription endpoint")

        await db.create_push_subscription(
            email=session.email,
            payload=payload,
        )

        return {"status": "subscribed"}

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/push/subscribe")
async def update_push_notification(
        payload: dict,
        session: enums.SessionInfo = Depends(db.require_session()),
):
    """
    Same payload shape as POST /push/subscribe.
    The server will locate the existing row by endpoint.
    """

    try:
        sub = payload.get("subscription") or {}
        if not sub.get("endpoint"):
            raise ValueError("Missing push subscription endpoint")

        updated = await db.update_push_subscription(
            email=session.email,
            payload=payload,
        )

        if not updated:
            raise ValueError("Subscription not found")

        return {"status": "updated"}

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
