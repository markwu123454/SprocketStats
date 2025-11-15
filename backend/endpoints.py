import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, Body, APIRouter, Request, Query
from starlette.responses import HTMLResponse
from google.oauth2 import id_token
from google.auth.transport import requests as g_requests
import os
import db
import enums
import importlib
translator = importlib.import_module("seasons.2025.translator")


router = APIRouter()


@router.get("/", response_class=HTMLResponse)
def root():
    return """
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>API Status</title>
            <style>
                :root{
                    --bg1:#140a2a; --bg2:#1f0b46; --card:#2a124d; --ink:#ffffff;
                    --ok:#8b5cf6; /* vivid purple */
                }
                *{box-sizing:border-box}
                html,body{height:100%}
                body{
                    margin:0; color:var(--ink);
                    background: radial-gradient( 80% 110% at 10% 10%, #4c2c7a,var(--bg2) ) fixed,
                        linear-gradient(135deg, var(--bg1), var(--bg2)) fixed;
                    display:flex; align-items:center; justify-content:center;
                    font:16px/1.5 system-ui,Segoe UI,Roboto,Helvetica,Arial;
                }
                .logo{
                    position:fixed; top:16px; left:16px; width:168px; height:168px;
                }
                .logo img{ position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
                .ring{ animation: spin 14s linear infinite; transform-origin: 50% 50%; }
                @keyframes spin{ from{transform:rotate(0)} to{transform:rotate(360deg)} }
            
                .card{
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(139,92,246,0.35);
                    border-radius: 16px;
                    padding: 42px 64px;
                    text-align:center;
                    box-shadow: 0 12px 40px rgba(0,0,0,0.35), inset 0 0 60px rgba(139,92,246,0.08);
                    backdrop-filter: blur(10px);
                }
                h1{ margin:0 0 8px; font-size:28px; letter-spacing:.3px }
                .status{
                    display:inline-block; font-weight:700; font-size:14px;
                    padding:8px 14px; border-radius:999px;
                    background: var(--ok); color:#0b0420;
                    box-shadow: 0 0 0 0 rgba(139,92,246,.6);
                    animation: pulse 2.2s ease-out infinite;
                }
                @keyframes pulse{
                    0%{ box-shadow:0 0 0 0 rgba(139,92,246,.55) }
                    70%{ box-shadow:0 0 0 14px rgba(139,92,246,0) }
                    100%{ box-shadow:0 0 0 0 rgba(139,92,246,0) }
                }
                .links{ margin-top:14px; opacity:.9 }
                .links a{ color:#c4b5fd; text-decoration:none; margin:0 10px; font-size:14px }
                .links a:hover{ text-decoration:underline }
            </style>
        </head>
        <body>
            <div class="logo" aria-hidden="true">
                <img class="ring" src="/static/sprocket_logo_ring.png" alt="">
                <img class="gear" src="/static/sprocket_logo_gear.png" alt="">
            </div>
        
            <div class="card">
                <h1>Scouting Server is Online</h1>
                <div class="status">STATUS: OK</div>
                <div class="links">
                    <a href="/docs">Swagger UI</a>
                    <a href="/redoc">ReDoc</a>
                    <a href="#" id="pingLink" onclick="sendPing(event)">Ping</a>
                </div>
                <script>
        async function sendPing(event) {
            event.preventDefault();
            const link = document.getElementById("pingLink");
            link.textContent = "Pinging...";
            const start = performance.now();
        
            try {
                const res = await fetch("/ping");
                if (!res.ok) throw new Error("Ping failed");
                await res.text(); // consume body
        
                const ms = Math.round(performance.now() - start);
                link.textContent = `Pong! (${ms}ms)`;
            } catch (err) {
                link.textContent = "Ping failed";
            }
        }
        </script>
          </div>
        </body>
        </html>
    """


@router.get("/ping")
def ping():
    return {"ping": "pong"}


@router.post("/auth/login")
async def login(request: Request, body: dict):
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

    if user["approval"] != "approved":
        raise HTTPException(status_code=403, detail="User pending approval")

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
            "guest_access": user["perm_guest_access"] if isinstance(user["perm_guest_access"], dict) else {},
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
        "permissions": session.permissions.dict(),
    }



@router.get("/metadata")
async def get_metadata(_: enums.SessionInfo = Depends(db.require_permission("admin"))):
    return await db.get_metadata()


@router.get("/admin/matches/filter")
async def admin_filter_matches(
    scouters: Optional[list[str]] = Query(None, description="List of scouter names to include"),
    statuses: Optional[list[enums.StatusType]] = Query(None, description="List of statuses to include"),
    _: enums.SessionInfo = Depends(db.require_permission("admin")),
):
    """
    Returns match entries (no data field) filtered by lists of scouters and/or statuses.
    Requires admin permission.
    """
    rows = await db.get_match_scouting()  # reuse existing function

    filtered = []
    for r in rows:
        if scouters and (r["scouter"] not in scouters):
            continue
        if statuses and (r["status"] not in [s.value if isinstance(s, enums.StatusType) else s for s in statuses]):
            continue

        filtered.append({
            "match": r["match"],
            "match_type": r["match_type"],
            "team": r["team"],
            "alliance": r["alliance"],
            "scouter": r["scouter"],
            "status": r["status"],
            "last_modified": r["last_modified"],
        })

    return {"count": len(filtered), "matches": filtered}



@router.get("/team/{team}")
async def get_team_basic_info(team: int):
    """
    Returns team number, nickname, rookie year, and whether the team
    has already been pit-scouted for the current event.
    """
    info = await db.get_team_info(team)
    if not info:
        raise HTTPException(status_code=404, detail="Team not found")

    # --- Check if team already scouted ---
    pit_records = await db.get_pit_scouting(team=team)
    scouted = len(pit_records) > 0

    return {
        "number": int(team),
        "nickname": info.get("nickname", f"Team {team}"),
        "rookie_year": info.get("rookie_year", None),
        "scouted": scouted
    }



@router.patch("/scouting/{m_type}/{match}/{team}/claim")
async def claim_team(
        m_type: enums.MatchType,
        match: int,
        team: int,
        scouter: str = Query(...),
        _: enums.SessionInfo = Depends(db.require_permission("match_scouting")),
):
    """
    Claims a team for the given scouter.
    Automatically sets its state to PRE.
    Fails if already claimed by someone else.
    """

    rows = await db.get_match_scouting(match=match, m_type=m_type, team=team)
    if not rows:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Race-safe: only claim if currently unclaimed
    updated = await db.update_match_scouting(
        match=match,
        m_type=m_type,
        team=team,
        scouter="__NONE__",
        scouter_new=scouter,
        status=enums.StatusType.PRE,  # ← set to PRE automatically
        data=None,
    )

    if not updated:
        raise HTTPException(status_code=409, detail="Already claimed by another scouter")

    return {"status": "claimed", "team": team, "scouter": scouter, "phase": "pre"}


@router.patch("/scouting/{m_type}/{match}/{team}/unclaim")
async def unclaim_team(
    m_type: enums.MatchType,
    match: int,
    team: int,
    scouter: str = Query(...),
    _: enums.SessionInfo = Depends(db.require_permission("match_scouting")),
    _body: str | None = Body(None)  # ← add this line
):
    """
    Unclaims a team if the requester currently owns it.
    Also resets its state to UNCLAIMED.
    """
    rows = await db.get_match_scouting(match=match, m_type=m_type, team=team)
    if not rows:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry = rows[0]

    if entry["scouter"] != scouter:
        raise HTTPException(status_code=403, detail="Cannot unclaim another scouter's team")

    updated = await db.update_match_scouting(
        match=match,
        m_type=m_type,
        team=team,
        scouter=scouter,
        scouter_new="__NONE__",
        status=enums.StatusType.UNCLAIMED,
        data=None,
    )

    if not updated:
        raise HTTPException(status_code=409, detail="Failed to unclaim (possible race)")

    return {"status": "unclaimed", "team": team}


@router.post("/scouting/{m_type}/{match}/{team}/unclaim-beacon")
async def unclaim_team_beacon(
    m_type: enums.MatchType,
    match: int,
    team: int,
    scouter: str = Query(...),
):
    """
    Beacon-compatible unclaim: skips auth and only unclaims if scouter matches current owner.
    """
    rows = await db.get_match_scouting(match=match, m_type=m_type, team=team)
    if not rows:
        return {"status": "noop", "reason": "not_found"}

    entry = rows[0]
    if entry["scouter"] != scouter:
        return {"status": "noop", "reason": "not_owner"}

    await db.update_match_scouting(
        match=match,
        m_type=m_type,
        team=team,
        scouter=scouter,
        scouter_new="__NONE__",
        status=enums.StatusType.UNCLAIMED,
        data=None,
    )
    return {"status": "unclaimed", "team": team}



@router.patch("/scouting/{m_type}/{match}/{team}/state")
async def update_state(
        m_type: enums.MatchType,
        match: int,
        team: int,
        scouter: str = Query(...),
        status: enums.StatusType = Query(...),
        _: enums.SessionInfo = Depends(db.require_permission("match_scouting")),
):
    """
    Updates the phase/state (pre, auto, teleop, post, submitted).
    Only the current scouter can update their own team's phase.
    Allows UNCLAIMED → PRE for initialization.
    """
    # --- Fetch entry ---
    rows = await db.get_match_scouting(match=match, m_type=m_type, team=team)
    if not rows:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry = rows[0]

    current_scouter = entry["scouter"]
    current_status = entry["status"]
    try:
        current_status = (
            current_status
            if isinstance(entry["status"], enums.StatusType)
            else enums.StatusType(entry["status"])
        )
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid stored status: {entry['status']}")

    # --- Access control ---
    if current_scouter != scouter:
        raise HTTPException(status_code=403, detail="Only current scouter may update state")

    # --- Valid progression order ---
    allowed_order = [
        enums.StatusType.PRE,
        enums.StatusType.AUTO,
        enums.StatusType.TELEOP,
        enums.StatusType.POST,
        enums.StatusType.SUBMITTED,
    ]

    # --- Handle UNCLAIMED safely ---
    if current_status == enums.StatusType.UNCLAIMED:
        # Allow transition to PRE only
        if status != enums.StatusType.PRE:
            raise HTTPException(status_code=400, detail="First phase after UNCLAIMED must be PRE")
    else:
        # Validate both are valid phases
        if current_status not in allowed_order or status not in allowed_order:
            raise HTTPException(status_code=400, detail=f"Invalid phase transition: {current_status} → {status}")

    # --- Apply update ---
    await db.update_match_scouting(
        match=match,
        m_type=m_type,
        team=team,
        scouter=scouter,
        scouter_new=scouter,  # no ownership change
        status=status,
        data=None,
    )

    return {"status": "updated", "team": team, "phase": status}


@router.patch("/scouting/{m_type}/{match}/{team}/{scouter}")
async def update_match(
        match: int,
        team: int,
        scouter: str,  # desired scouter; use "__UNCLAIM__" to clear
        m_type: enums.MatchType,
        body: Dict[str, Any] = Body(...),
        _: enums.SessionInfo = Depends(db.require_permission("match_scouting")),
):
    # Fetch existing row (without scouter to find the current owner)
    rows = await db.get_match_scouting(match=match, m_type=m_type, team=team)
    if not rows:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry = rows[0]
    if not isinstance(entry["match_type"], enums.MatchType):
        entry["match_type"] = enums.MatchType(entry["match_type"])

    current_scouter: Optional[str] = entry["scouter"]
    desired_scouter: Optional[str] = None if scouter == "__UNCLAIM__" else scouter

    # Extract status from body if present; else keep current
    status: Optional[enums.StatusType] = None
    if "status" in body and body["status"] is not None:
        status = enums.StatusType(body["status"])

    # Strip meta fields from the stored data; keep the rest as the scouting payload
    data = {k: v for k, v in body.items() if
            k not in {"match", "match_type", "team", "teamNumber", "scouter", "status"}}

    # Single atomic update: merge data, update status, optionally reassign scouter
    await db.update_match_scouting(
        match=match,
        m_type=m_type,
        team=team,
        scouter=current_scouter,
        status=status,  # None ⇒ keep existing
        data=data,  # merged into existing
        scouter_new=desired_scouter,
    )

    return {
        "status": "patched",
        "scouter": desired_scouter,
        "phase": status.value if status else entry["status"],
        "changed_scouter": desired_scouter != current_scouter,
    }


@router.post("/scouting/{m_type}/{match}/{team}/submit")
async def submit_data(
        m_type: enums.MatchType,
        match: int,
        team: int,
        full_data: enums.FullData,
        _: enums.SessionInfo = Depends(db.require_permission("match_scouting"))
):
    data = full_data.model_dump()
    data.pop("alliance", None)
    data.pop("scouter", None)
    data.pop("match_type", None)

    # Check if entry exists
    existing = await db.get_match_scouting(
        match=match,
        m_type=m_type,
        team=team,
        scouter=full_data.scouter
    )

    if not existing:
        # Add it first
        await db.add_match_scouting(
            match=match,
            m_type=m_type,
            team=team,
            alliance=full_data.alliance,
            scouter=full_data.scouter,
            status=enums.StatusType.POST,  # Initial status before submit
            data={}  # Start with empty data
        )

    # Then update it with the submitted data
    await db.update_match_scouting(
        match=match,
        m_type=m_type,
        team=team,
        scouter=full_data.scouter,
        status=enums.StatusType.SUBMITTED,
        data=data
    )

    return {"status": "submitted"}


@router.get("/match/{m_type}/{match}/{alliance}")
async def get_match_info(
        m_type: enums.MatchType,
        match: int,
        alliance: enums.AllianceType,
        _: enums.SessionInfo = Depends(db.require_permission("match_scouting"))
):
    """
    Retrieves match info directly from DB using metadata.current_event.
    """
    # Fetch match info automatically scoped to current_event
    match_row = await db.get_match_info(m_type.value, match)
    if not match_row:
        raise HTTPException(status_code=404, detail="Match not found in database")

    # Extract alliance teams
    if alliance == enums.AllianceType.RED:
        team_numbers = [t for t in match_row["red"] if t is not None]
    elif alliance == enums.AllianceType.BLUE:
        team_numbers = [t for t in match_row["blue"] if t is not None]

    # Ensure each team has a match_scouting entry
    for t in team_numbers:
        existing = await db.get_match_scouting(match=match, m_type=m_type, team=str(t))
        if not existing:
            await db.add_match_scouting(
                match=match,
                m_type=m_type,
                team=t,
                alliance=alliance,
                scouter=None,
                status=enums.StatusType.UNCLAIMED,
                data={}
            )

    return {
        "teams": [
            {
                "number": int(t),
                "name": f"Team {t}",
                "scouter": (await db.get_match_scouting(match=match, m_type=m_type, team=t))[0].get("scouter"),
                "nickname": (await db.get_team_info(t))["nickname"]
            }
            for t in team_numbers
        ]
    }


@router.get("/match/{m_type}/{match}/{alliance}/state")
async def get_scouter_state(
        m_type: enums.MatchType,
        match: int,
        alliance: enums.AllianceType,
        _: enums.SessionInfo = Depends(db.require_permission("match_scouting")),
):
    entries = await db.get_match_scouting(match=match, m_type=m_type)
    relevant = [e for e in entries if e["alliance"] == alliance.value]

    return {
        "teams": {
            str(e["team"]): {"scouter": e.get("scouter")}
            for e in relevant
        }
    }


@router.get("/pit/teams")
async def list_pit_teams(
    _: enums.SessionInfo = Depends(db.require_permission("pit_scouting")),
):
    """
    Lists all teams with pit scouting data for the current event.
    """
    rows = await db.get_pit_scouting()  # uses metadata.current_event internally
    return {"teams": [
        {
            "team": r["team"],
            "scouter": r.get("scouter"),
            "status": r.get("status"),
            "last_modified": r.get("last_modified")
        }
        for r in rows
    ]}


@router.get("/pit/{team}")
async def get_pit_team(
    team: int,
    _: enums.SessionInfo = Depends(db.require_permission("pit_scouting")),
):
    """
    Fetches a single team's pit scouting data.
    """
    rows = await db.get_pit_scouting(team=team)
    if not rows:
        raise HTTPException(status_code=404, detail="No pit scouting entry found")
    entry = rows[0]
    return {
        "team": entry["team"],
        "scouter": entry["scouter"],
        "status": entry["status"],
        "data": entry["data"],
        "last_modified": entry["last_modified"],
    }


@router.post("/pit/{team}")
async def update_pit_team(
    team: int,
    body: Dict[str, Any] = Body(...),
    _: enums.SessionInfo = Depends(db.require_permission("pit_scouting")),
):
    """
    Creates or updates pit scouting data for a team.
    """
    existing = await db.get_pit_scouting(team=team)
    scouter = body.get("scouter")
    status = enums.StatusType(body.get("status", enums.StatusType.PRE.value))

    if not existing:
        # insert new row
        await db.add_pit_scouting(
            team=team,
            scouter=scouter,
            status=status,
            data=body.get("data", {}),
        )
        return {"status": "created", "team": team}

    # merge/update existing
    await db.update_pit_scouting(
        team=team,
        scouter=scouter,
        status=status,
        data=body.get("data", {}),
    )
    return {"status": "updated", "team": team}


@router.post("/pit/{team}/submit")
async def submit_pit_data(
    team: int,
    full_data: Dict[str, Any] = Body(...),
    _: enums.SessionInfo = Depends(db.require_permission("pit_scouting")),
):
    """
    Finalizes pit scouting data for a team and marks it as SUBMITTED.
    """
    rows = await db.get_pit_scouting(team=team)
    if not rows:
        # create entry if missing
        await db.add_pit_scouting(
            team=team,
            scouter=full_data.get("scouter"),
            status=enums.StatusType.POST,
            data={}
        )

    await db.update_pit_scouting(
        team=team,
        scouter=full_data.get("scouter"),
        status=enums.StatusType.SUBMITTED,
        data=full_data.get("data", full_data),
    )

    return {"status": "submitted", "team": team}


@router.get("/data/processed")
async def get_data_processed(
    _: enums.SessionInfo = Depends(db.require_permission("admin")),
    event_key: Optional[str] = None,
):
    result = await db.get_processed_data(event_key)
    result = translator.generate_sample_data(result)
    return {"event_key": event_key, "data": result}


'''
@router.post("/auth/login/guest")
async def guest_login(request: Request, body: enums.PasscodeBody):
    """
    Guest login: limited permissions; passcode still verified in users table.
    """
    user = await db.get_user_by_passcode(body.passcode)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid passcode")

    session_id = str(uuid.uuid4())
    expires_dt = datetime.now(timezone.utc) + request.app.state.config.get("SESSION_DURATION", timedelta(hours=2))

    session_data = {
        "name": user["name"],
        "permissions": {
            "dev": False,
            "admin": False,
            "match_scouting": False,
            "pit_scouting": False,
            "match_access": user["match_access"]
        },
        "expires": expires_dt.isoformat()
    }

    await db.add_session(session_id, session_data, expires_dt)

    return {
        "uuid": session_id,
        "name": session_data["name"],
        "expires": session_data["expires"],
        "permissions": session_data["permissions"]
    }
    
    
@router.post("/admin/expire/{session_id}")
async def expire_uuid(session_id: str, _: enums.SessionInfo = Depends(db.require_permission("admin"))):
    """
    Expires a single UUID session.
    """
    await db.delete_session(session_id)
    return {"status": "expired"}


@router.post("/admin/expire_all")
async def expire_all(_: enums.SessionInfo = Depends(db.require_permission("admin"))):
    """
    Expires all UUID sessions.
    """
    await db.delete_all_sessions()
    return {"status": "all expired"}


@router.post("/admin/set_event")
async def set_event(event: str, _: enums.SessionInfo = Depends(db.require_permission("admin"))):
    """
    Admin-only: Initializes the scouting database for a given event key.
    Pulls data from TBA and creates empty records for each team in each match.
    """
    try:
        matches = tba_fetcher.get_event_data(event)["matches"]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch event data: {str(e)}")

    # Insert match data into the database using async calls
    for match in matches:
        match_key = match["key"].split("_")[-1]  # e.g., qm1
        for alliance in enums.AllianceType:
            for team_key in match["alliances"][alliance.value]["team_keys"]:
                team_number = int(team_key[3:])
                # Use db.py to insert match scouting data asynchronously
                await db.add_match_scouting(
                    match=match_key,
                    m_type=enums.MatchType.QUALIFIER,  # Assuming match type is "qm" for simplicity
                    team=team_number,
                    alliance=alliance,  # Directly using the Enum value
                    scouter=None,
                    status=enums.StatusType.UNCLAIMED,
                    data={}
                )

    return {"status": "event initialized", "matches": len(matches)}



@router.get("/poll/admin_match/{match}/{match_type}")
async def poll_admin_match_changes(
        match: int,
        match_type: str,
        client_ts: str = "",
        _: enums.SessionInfo = Depends(db.require_permission("admin"))
):
    timeout_ns = 10 * 1_000_000_000  # 10 seconds
    check_interval = 0.2  # seconds

    def parse_ts(ts: str) -> int:
        try:
            return int(ts)
        except Exception:
            return 0

    client_ns = parse_ts(client_ts)

    async def get_current_state():
        entries = await db.get_match_scouting(match=match)
        relevant = [e for e in entries if e["match_type"] == match_type]
        latest_ns = max((e["last_modified"] for e in relevant if e["last_modified"]), default=0)
        return relevant, latest_ns

    start = time.time_ns()
    while True:
        current_state, latest_ns = await get_current_state()
        if latest_ns > client_ns:
            await asyncio.sleep(0.3)
            current_state, latest_ns = await get_current_state()
            return {
                "timestamp": str(latest_ns),
                "entries": current_state  # full list of match_scouting dicts
            }

        if time.time_ns() - start > timeout_ns:
            return {
                "timestamp": str(latest_ns) if latest_ns else None,
                "entries": current_state
            }

        await asyncio.sleep(check_interval)
'''
