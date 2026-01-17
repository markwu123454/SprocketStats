from fastapi import Depends, HTTPException, APIRouter
import enums, db
from pydantic import BaseModel
from typing import Dict, Any

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

class PushSelectionPayload(BaseModel):
    settings: Dict[str, Any]


@router.put("/push/selection")
async def select_push_notification(
        payload: dict,
        session: enums.SessionInfo = Depends(db.require_session()),
):
    """
    Updates the settings JSONB column for a specific push subscription.
    Expected payload: { "endpoint": "...", "settings": { ... } }
    """
    # 1. Extract the endpoint (required to locate the row)
    # Note: Adjust the path if your TS payload puts endpoint inside a 'subscription' object
    endpoint = payload.get("endpoint") or payload.get("subscription", {}).get("endpoint")

    if not endpoint:
        raise HTTPException(status_code=400, detail="Missing endpoint in payload")

    # 2. Extract the settings dictionary
    settings_data = payload.get("settings")
    if settings_data is None:
        raise HTTPException(status_code=400, detail="Missing settings data")

    # 3. Call your existing DB function
    # We pass 'settings' inside the updates dict so COALESCE($6, settings) works
    updated = await db.update_push_subscription(
        email=session.email,
        endpoint=endpoint,
        updates={"settings": settings_data}
    )

    if not updated:
        raise HTTPException(status_code=404, detail="Subscription not found for this user")

    return {"status": "settings_updated"}