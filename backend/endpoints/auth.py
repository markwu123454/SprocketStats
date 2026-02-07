import uuid
from datetime import datetime, timezone, timedelta
from fastapi import Depends, HTTPException, APIRouter, Request
from google.oauth2 import id_token
from google.auth.transport import requests as g_requests
import os
import db
import enums

router = APIRouter()


@router.post("/auth/login")
async def login(_: Request, body: dict):
    """
    Authenticates via Google ID token and issues a session.
    """
    token = body.get("credential")
    if not token:
        raise HTTPException(status_code=400, detail="Missing credential")

    try:
        info = id_token.verify_oauth2_token(
            token,
            g_requests.Request(),
            os.getenv("GOOGLE_CLIENT_ID"),
            clock_skew_in_seconds=5
        )
        email = info["email"]
        name = info.get("name", email.split("@")[0])
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {e}")

    # ensure user exists or create placeholder
    await db.create_user_if_missing(email, name)
    user = await db.get_user_by_email(email)

    # Check user approval status
    if user["approval"] == "banned":
        raise HTTPException(status_code=403, detail="Account has been banned")

    if user["approval"] not in ["approved", "autoapproved"]:
        raise HTTPException(status_code=403, detail="Account pending approval")

    # --- build session ---
    session_id = str(uuid.uuid4())
    expires_dt = datetime.now(timezone.utc) + timedelta(hours=8)

    session_data = {
        "email": user["email"],
        "name": user["name"],
        "permissions": {
            "dev": user["perm_dev"],
            "admin": user["perm_admin"],
            "match_scouting": user["perm_match_scout"],
            "pit_scouting": user["perm_pit_scout"],
        },
        "expires": expires_dt.isoformat(),
    }

    await db.add_session(session_id, session_data, expires_dt)

    return {
        "uuid": session_id,
        "name": user["name"],
        "email": user["email"],
        "expires": session_data["expires"],
        "permissions": session_data["permissions"],
    }


@router.get("/auth/verify")
async def verify(session: enums.SessionInfo = Depends(db.require_session())):
    """
    Verifies the session UUID and returns identity + permissions.
    """
    return {
        "email": session.email,
        "name": session.name,
        "permissions": session.permissions.model_dump(),
    }

