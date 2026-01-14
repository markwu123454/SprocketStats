import asyncio
import json
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from fastapi import Depends, HTTPException, Body, APIRouter, Request, Query
from pydantic import BaseModel
from starlette.responses import HTMLResponse
from google.oauth2 import id_token
from google.auth.transport import requests as g_requests
import os
import db
import tba_db as tba
import statbot_db as statbot
import enums
import importlib

translator = importlib.import_module("seasons.2026.translator")

router = APIRouter()


# === General ===

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


# === Auth ===

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

    if user["approval"] != "approved" and user["approval"] != "autoapproved":
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


# === Admin ===

@router.get("/metadata")
async def get_metadata(_: enums.SessionInfo = Depends(db.require_permission("admin"))):
    return await db.get_metadata()


@router.get("/metadata/feature_flags")
async def get_feature_flags():
    return await db.get_feature_flags()


@router.get("/admin/matches/active")
async def admin_active_matches(
        _: enums.SessionInfo = Depends(db.require_permission("admin")),
):
    """
    Returns all matches where at least one team is in
    PRE / AUTO / TELEOP / POST.

    Structure:
    {
        "qm": {
            1: {
                "time": <timestamp | None>,
                "red": {
                    4414: {
                        "scouter": "",
                        "name": "",
                        "phase": "",
                        "assigned_scouter": "",
                        "assigned_name": ""
                    }
                },
                "blue": {
                    ...
                }
            }
        }
    }
    """

    ACTIVE_PHASES = {
        enums.StatusType.PRE.value,
        enums.StatusType.AUTO.value,
        enums.StatusType.TELEOP.value,
        enums.StatusType.POST.value,
    }

    rows = await db.get_match_scouting()

    # --------------------------------------------------
    # Group scouting rows by (match_type, match)
    # --------------------------------------------------
    grouped: dict[tuple[str, int], list[dict]] = {}
    for r in rows:
        key = (r["match_type"], r["match"])
        grouped.setdefault(key, []).append(r)

    result: dict[str, dict[int, dict]] = {}

    # Cache users to avoid repeated DB hits
    user_cache: dict[str, dict | None] = {}

    async def get_name(email: str | None) -> str | None:
        if not email:
            return None
        if email not in user_cache:
            user_cache[email] = await db.get_user_by_email(email)
        return user_cache[email].get("name") if user_cache[email] else None

    # --------------------------------------------------
    # Process each match
    # --------------------------------------------------
    for (m_type_str, match), entries in grouped.items():

        # Convert DB string → enum
        try:
            m_type = enums.MatchType(m_type_str)
        except ValueError:
            continue

        # Include match if ANY team is active
        if not any(e["status"] in ACTIVE_PHASES for e in entries):
            continue

        match_info = await db.get_match_info(m_type.value, match)
        if not match_info:
            continue

        red_sched = await db.get_match_scouters_schedule(
            match_type=m_type,
            match_number=match,
            alliance=enums.AllianceType.RED,
        )

        blue_sched = await db.get_match_scouters_schedule(
            match_type=m_type,
            match_number=match,
            alliance=enums.AllianceType.BLUE,
        )

        # Index scouting entries by team number
        by_team = {int(e["team"]): e for e in entries}

        async def build_alliance(teams, scheduled):
            data = {}
            for team, assigned in zip(teams, scheduled or []):
                entry = by_team.get(team)

                scouter_email = entry.get("scouter") if entry else None
                assigned_email = assigned

                data[team] = {
                    "scouter": scouter_email,
                    "name": await get_name(scouter_email),
                    "phase": entry.get("status") if entry else enums.StatusType.UNCLAIMED.value,
                    "assigned_scouter": assigned_email,
                    "assigned_name": await get_name(assigned_email),
                }
            return data

        result.setdefault(m_type.value, {})[match] = {
            "time": match_info.get("actual_time") or match_info.get("scheduled_time"),
            "red": await build_alliance(match_info["red"], red_sched),
            "blue": await build_alliance(match_info["blue"], blue_sched),
        }

    return result


@router.get("/latency")
async def get_latency(request: Request) -> Dict[str, Any]:
    # t2 — timestamp when request arrives at server
    server_receive_ns = time.time_ns()

    # ✅ Parse the header into THIS variable
    client_request_sent_ns = request.headers.get("client-sent-ns")
    if client_request_sent_ns is None:
        raise HTTPException(status_code=400, detail="Missing client-sent-ns header")

    try:
        client_request_sent_ns = int(client_request_sent_ns)
    except:
        raise HTTPException(status_code=400, detail="Invalid client-sent-ns value")

    # DB latency measurement
    latency = await db.measure_db_latency()

    # t3 — timestamp right before server sends response
    server_finish_ns = time.time_ns()

    # ✅ Echo back EXACTLY what we parsed + our own timestamps
    return {
        "client_request_sent_ns": client_request_sent_ns,
        "server_receive_ns": server_receive_ns,
        "server_finish_ns": server_finish_ns,
        "latency": latency,
    }


# === Match scouting ===

@router.post("/scouting/{m_type}/{match}/{alliance}")
async def scouting(
        m_type: enums.MatchType,
        match: int,
        alliance: enums.AllianceType,
        action: str = Query(...),
        team: int | None = Query(None),
        session: enums.SessionInfo = Depends(db.require_permission("match_scouting")),
):
    scouter_email = session.email

    # -----------------------------
    # BOOTSTRAP MATCH ROWS
    # -----------------------------
    match_row = await db.get_match_info(m_type.value, match)
    if not match_row:
        raise HTTPException(status_code=404, detail="Match not found in database")

    # Teams for this alliance
    alliance_teams = (
        match_row["red"] if alliance == enums.AllianceType.RED else match_row["blue"]
    )

    # Create missing rows
    for t in alliance_teams:
        if t is None:
            continue
        existing = await db.get_match_scouting(match=match, m_type=m_type, team=t)
        if not existing:
            await db.add_match_scouting(
                match=match,
                m_type=m_type,
                team=t,
                alliance=alliance,
                status=enums.StatusType.UNCLAIMED,
                data={}
            )

    # -----------------------------
    # LOAD STATE
    # -----------------------------
    rows = await db.get_match_scouting(match=match, m_type=m_type)
    teams = {int(r["team"]): r for r in rows}

    entry = teams.get(team) if team is not None else None

    current_scouter = entry["scouter"] if entry else None
    current_status = (
        enums.StatusType(entry["status"])
        if entry else enums.StatusType.UNCLAIMED
    )

    result = "noop"
    message = None

    # -----------------------------
    # ACTIONS
    # -----------------------------
    try:
        if action == "info":
            result = "success"


        elif team is None:
            result = "fail"
            message = "This action requires a team to be specified."


        # ---- CLAIM ----
        elif action == "claim":
            if current_scouter is None:
                updated = await db.update_match_scouting(
                    match=match,
                    m_type=m_type,
                    team=team,
                    scouter=None,
                    scouter_new=scouter_email,
                    status=enums.StatusType.PRE,
                    data=None,
                )
                if updated:
                    result = "success"
                else:
                    result = "fail"
                    message = "Failed to claim: database update rejected."
            else:
                result = "fail"
                message = "Team is already claimed by another scouter."

        # ---- UNCLAIM ----
        elif action == "unclaim":
            print(current_scouter, scouter_email)
            if current_scouter == scouter_email:
                updated = await db.update_match_scouting(
                    match=match,
                    m_type=m_type,
                    team=team,
                    scouter=scouter_email,
                    scouter_new=None,
                    status=enums.StatusType.UNCLAIMED,
                    data=None,
                )
                if updated:
                    result = "success"
                else:
                    result = "fail"
                    message = "Failed to unclaim: database update rejected."
            else:
                result = "fail"
                message = "You do not own this team."

        # ---- SWITCH TEAM ----
        elif action == "switch":
            if team is None:
                result = "fail"
                message = "Target team must be specified."
            else:
                # Find the team this scouter currently owns in this match+alliance
                owned = None
                for t, r in teams.items():
                    if r["scouter"] == scouter_email:
                        owned = t
                        break

                if not owned:
                    result = "fail"
                    message = "You do not currently own any team in this match."

                elif owned == team:
                    result = "fail"
                    message = "You already own this team."

                else:
                    target = teams.get(team)

                    if not target or target["scouter"] is not None:
                        result = "fail"
                        message = "Target team is already claimed."

                    else:
                        # Release old team
                        released = await db.update_match_scouting(
                            match=match,
                            m_type=m_type,
                            team=owned,
                            scouter=scouter_email,
                            scouter_new=None,
                            status=enums.StatusType.UNCLAIMED,
                            data=None,
                        )

                        if not released:
                            result = "fail"
                            message = "Failed to release current team."
                        else:
                            # Claim new team
                            claimed = await db.update_match_scouting(
                                match=match,
                                m_type=m_type,
                                team=team,
                                scouter=None,
                                scouter_new=scouter_email,
                                status=enums.StatusType.PRE,
                                data=None,
                            )

                            if claimed:
                                result = "success"
                            else:
                                # Rollback release if claim failed
                                await db.update_match_scouting(
                                    match=match,
                                    m_type=m_type,
                                    team=owned,
                                    scouter=None,
                                    scouter_new=scouter_email,
                                    status=current_status,
                                    data=None,
                                )
                                result = "fail"
                                message = "Switch failed; original team restored."


        # ---- PHASE ----
        elif action.startswith("set_"):
            if current_scouter != scouter_email:
                result = "fail"
                message = "You do not own this team."
            else:
                new_status = enums.StatusType(action.replace("set_", "").upper())

                order = [
                    enums.StatusType.PRE,
                    enums.StatusType.AUTO,
                    enums.StatusType.TELEOP,
                    enums.StatusType.POST,
                    enums.StatusType.SUBMITTED,
                ]

                ok = (
                        (current_status == enums.StatusType.UNCLAIMED and new_status == enums.StatusType.PRE)
                        or (
                                current_status in order
                                and new_status in order
                                and order.index(new_status) >= order.index(current_status)
                        )
                )

                if ok:
                    await db.update_match_scouting(
                        match=match,
                        m_type=m_type,
                        team=team,
                        scouter=scouter_email,
                        scouter_new=scouter_email,
                        status=new_status,
                        data=None,
                    )
                    result = "success"
                else:
                    result = "fail"
                    message = f"Invalid phase transition from {current_status.value} to {new_status.value}."

        else:
            result = "fail"
            message = "Unknown action."
            if current_scouter == scouter_email:
                updated = await db.update_match_scouting(
                    match=match,
                    m_type=m_type,
                    team=team,
                    scouter=scouter_email,
                    scouter_new=None,
                    status=enums.StatusType.UNCLAIMED,
                    data=None,
                )



    except Exception as e:
        result = "fail"
        message = "Internal error while processing request."

    # -----------------------------
    # ALWAYS RETURN FULL STATE (ONLY THIS ALLIANCE)
    # -----------------------------
    rows = await db.get_match_scouting(match=match, m_type=m_type)

    # Team numbers in correct DS order
    alliance_teams = (
        match_row["red"] if alliance == enums.AllianceType.RED else match_row["blue"]
    )

    # Index scouting rows by team
    by_team = {int(r["team"]): r for r in rows}

    # Assigned scouters (already DS-ordered)
    assigned = await db.get_match_scouters_schedule(
        match_type=m_type,
        match_number=match,
        alliance=alliance,
    )

    # Collect all emails we need to resolve
    emails = set()
    for t in alliance_teams:
        if t is None:
            continue
        r = by_team.get(t)
        if r and r["scouter"]:
            emails.add(r["scouter"])

    if assigned:
        for e in assigned:
            if e:
                emails.add(e)

    # Resolve users
    user_map = {}
    for email in emails:
        u = await db.get_user_by_email(email)
        if u:
            user_map[email] = u["name"]

    # Build alliance-only response in DS order
    match_state = []

    for i, team_num in enumerate(alliance_teams):
        if team_num is None:
            continue

        r = by_team.get(team_num)

        scouter = r["scouter"] if r else None

        assigned_email = assigned[i] if assigned and i < len(assigned) else None

        match_state.append({
            "team": team_num,
            "scouterEmail": scouter,
            "scouterName": user_map.get(scouter),
            "assignedScouterEmail": assigned_email,
            "assignedScouterName": user_map.get(assigned_email),
            "status": r["status"] if r else enums.StatusType.UNCLAIMED.value,
        })

    return {
        "action": result,
        "message": message,
        "match": match_state,
    }


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
        scouter_new=None,
        status=enums.StatusType.UNCLAIMED,
        data=None,
    )
    return {"status": "unclaimed", "team": team}


@router.post("/scouting/{m_type}/{match}/{team}/submit")
async def submit_data(
        m_type: enums.MatchType,
        match: int,
        team: int,
        full_data: enums.FullData,
        session: enums.SessionInfo = Depends(db.require_permission("match_scouting"))
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
        scouter=session.email
    )

    if not existing:
        # Add it first
        await db.add_match_scouting(
            match=match,
            m_type=m_type,
            team=team,
            alliance=full_data.alliance,
            scouter=session.email,
            status=enums.StatusType.POST,  # Initial status before submit
            data={}  # Start with empty data
        )

    # Then update it with the submitted data
    await db.update_match_scouting(
        match=match,
        m_type=m_type,
        team=team,
        scouter=session.email,
        status=enums.StatusType.SUBMITTED,
        data=data
    )

    return {"status": "submitted"}


@router.get("/scouter/schedule")
async def get_scouter_match_schedule(
        session: enums.SessionInfo = Depends(db.require_permission("match_scouting")),
):
    """
    Return all matches a scouter is assigned to scout for the current event.

    Response:
        [
            {
                "match_type": str,
                "match_number": int,
                "set_number": int,
                "alliance": "red" | "blue",
                "robot": int,
            },
        ]
    """

    scouter = session.email

    schedule = await db.get_scouters_match_schedule(
        scouter=scouter,
    )

    return {
        "assignments": schedule,
    }


@router.get("/matches/schedule")
async def get_all_matches(
        _: enums.SessionInfo = Depends(db.require_permission("admin")),
):
    """
    Return all matches for the current event,
    along with all users who can do match scouting.

    Admin-only endpoint.
    Used for scheduling, assignments, and bulk editing.
    """
    return {
        "matches": await db.get_all_matches(),
        "scouters": await db.get_match_scout_users(),
    }


class MatchUpdate(BaseModel):
    key: str
    scheduled_time: datetime | None = None
    actual_time: datetime | None = None
    red1: int | None = None
    red2: int | None = None
    red3: int | None = None
    blue1: int | None = None
    blue2: int | None = None
    blue3: int | None = None
    red1_scouter: str | None = None
    red2_scouter: str | None = None
    red3_scouter: str | None = None
    blue1_scouter: str | None = None
    blue2_scouter: str | None = None
    blue3_scouter: str | None = None


class BulkMatchUpdate(BaseModel):
    matches: List[MatchUpdate]


@router.patch("/matches/schedule")
async def update_match_schedule(
        payload: BulkMatchUpdate = Body(...),
        _: enums.SessionInfo = Depends(db.require_permission("admin")),
):
    """
    Bulk update match schedule, teams, and scouter assignments.

    Admin-only endpoint.
    Used for scheduling, assignments, and bulk editing.
    """
    if not payload.matches:
        raise HTTPException(
            status_code=400,
            detail="No match updates provided",
        )

    await db.update_matches_bulk(payload.matches)

    return {"status": "ok"}


# === Pit scouting ===

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


@router.get("/team/{team}")
async def get_pit_scout_status(team: int):
    """
    Returns whether the team has already been pit-scouted for the current event.
    """
    pit_records = await db.get_pit_scouting(team=team)
    scouted = len(pit_records) > 0

    return {
        "scouted": scouted
    }


# === Attendance ===

@router.get("/attendance/meeting-time")
async def get_meeting_time_timeline(
        _: enums.SessionInfo = Depends(db.require_permission("admin")),
):
    """
    Returns the full meeting timeline as alternating
    checkin / checkout events.
    """
    return await db.get_meeting_time_events()

class MeetingTimeRequest(BaseModel):
    start: datetime
    end: datetime

@router.post("/attendance/meeting-time")
async def add_meeting_time(
        payload: MeetingTimeRequest,
        _: enums.SessionInfo = Depends(db.require_permission("admin")),

):
    try:
        await db.add_meeting_time_block(payload.start, payload.end)
        return {"status": "meeting added"}
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

@router.delete("/attendance/meeting-time")
async def delete_meeting_time(
        payload: MeetingTimeRequest,
        _: enums.SessionInfo = Depends(db.require_permission("admin")),

):
    try:
        await db.delete_meeting_time_block(payload.start, payload.end)
        return {"status": "meeting deleted"}
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/attendance")
async def admin_get_attendance(
        _: enums.SessionInfo = Depends(db.require_session()),
):
    return await db.compute_attendance_totals()


@router.post("/attendance/checkin")
async def attendance_checkin(
        session: enums.SessionInfo = Depends(db.require_session()),
):
    try:
        await db.record_attendance_event(session.email, "checkin")
        return {"status": "checked_in"}
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/attendance/checkout")
async def attendance_checkout(
        session: enums.SessionInfo = Depends(db.require_session()),
):
    try:
        await db.record_attendance_event(session.email, "checkout")
        return {"status": "checked_out"}
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/attendance/status")
async def attendance_status(
        session: enums.SessionInfo = Depends(db.require_session()),
):
    user_email = session.email

    user_checked_in = await db.is_user_currently_checked_in(user_email)
    meeting_checked_in = await db.is_user_currently_checked_in("meeting time")

    return {
        "is_checked_in": user_checked_in,
        "meeting_active": meeting_checked_in,
    }


# === Data ===

def filter_processed_data(data: dict, perms: dict) -> dict:
    """
    Filters the processed data according to the permission structure:
      - ranking: True/False
      - alliance: True/False
      - match: list of allowed match IDs
      - team: list of allowed team numbers
    """

    filtered = {}

    # Ranking
    if perms.get("ranking"):
        filtered["ranking"] = data.get("ranking", {})
    else:
        filtered["ranking"] = {}

    # Alliance
    if perms.get("alliance"):
        filtered["alliance"] = data.get("alliance", {})
    else:
        filtered["alliance"] = {}

    # Match
    allowed_matches = perms.get("match")
    if isinstance(allowed_matches, list):
        # include only whitelisted matches
        filtered["match"] = {
            mid: mdata
            for mid, mdata in data.get("match", {}).items()
            if mid in allowed_matches
        }
    elif allowed_matches is True:  # allow all matches
        filtered["match"] = data.get("match", {})
    else:
        filtered["match"] = {}

    # Team
    allowed_teams = perms.get("team")
    if isinstance(allowed_teams, list):
        # Teams in data may use ints or strings; normalize
        allowed_team_set = {str(t) for t in allowed_teams}

        filtered["team"] = {
            str(tid): tdata
            for tid, tdata in data.get("team", {}).items()
            if str(tid) in allowed_team_set
        }
    elif allowed_teams is True:  # allow all teams
        filtered["team"] = data.get("team", {})
    else:
        filtered["team"] = {}

    return filtered


@router.get("/data/processed/admin")
async def get_data_processed_admin(
        event_key: Optional[str] = None,
        _: enums.SessionInfo = Depends(db.require_permission("admin")),
):
    # Load data
    result = await db.get_processed_data(event_key)
    result = translator.generate_sample_data(result)

    full_perms = {
        "ranking": True,
        "alliance": True,
        "match": list(result.get("match", {}).keys()),
        "team": list(result.get("team", {}).keys()),
    }

    return {
        "event_key": event_key,
        "raw_data": result,
        "guest_name": "admin",
        "permissions": full_perms,
    }


@router.get("/data/processed/guest")
async def get_data_processed_guest(
        event_key: Optional[str] = None,
        guest=Depends(db.require_guest_password()),
):
    # Load data
    result = await db.get_processed_data(event_key)
    result = translator.generate_sample_data(result)

    perms = guest["perms"]
    filtered = filter_processed_data(result, perms)

    return {
        "event_key": event_key,
        "raw_data": filtered,
        "guest_name": guest["name"],
        "permissions": perms,
    }


@router.get("/admin/get_guests")
async def admin_get_guests(
        _: enums.SessionInfo = Depends(db.require_permission("admin")),
):
    """
    Admin-only endpoint.
    Returns all guest records, including passwords.
    """
    return await db.get_all_guests()


@router.get("/data/candy")
async def get_candy_data():
    cache_key = "candy_cache"

    # ---------------------------------------------------------
    # Step 0 – Read cache if it exists
    # ---------------------------------------------------------
    cached_raw = await db.get_misc(cache_key)
    if cached_raw is not None:
        try:
            return json.loads(cached_raw)
        except Exception:
            pass  # corrupted cache → recompute from scratch

    # ---------------------------------------------------------
    # Step 1 – Fetch teams for the two target events
    # ---------------------------------------------------------
    events = ["2026capoh", "2026casgv"]

    event_team_map = {
        event: await tba.fetch(f"event/{event}/teams/keys", use_backoff=True) or []
        for event in events
    }

    # Unique numeric team list
    all_numeric = sorted(
        {int(t[3:]) for team_list in event_team_map.values() for t in team_list}
    )

    # ---------------------------------------------------------
    # Step 2 – Fetch past events for each team (parallel)
    # ---------------------------------------------------------
    past_event_tasks = {
        num: tba.fetch(f"team/frc{num}/events", use_backoff=True)
        for num in all_numeric
    }

    team_past_events = {
        num: (await future) or []
        for num, future in past_event_tasks.items()
    }

    # ---------------------------------------------------------
    # Step 3 – Determine all district events that need DP fetches
    # ---------------------------------------------------------
    district_event_keys = set()

    for num, ev_list in team_past_events.items():
        for e in ev_list:
            # event_type == 1 → district qualifier
            if e.get("event_type") == 1 and e.get("key"):
                district_event_keys.add(e["key"])

    # ---------------------------------------------------------
    # Step 4 – Fetch district points for all relevant past events
    # ---------------------------------------------------------
    dp_tasks = {
        ev_key: tba.fetch(f"event/{ev_key}/district_points", use_backoff=True)
        for ev_key in district_event_keys
    }

    full_dp_map = {}

    for ev_key, fut in dp_tasks.items():
        raw = await fut
        if raw and isinstance(raw, dict):
            full_dp_map[ev_key] = raw.get("points", {}) or {}
        else:
            full_dp_map[ev_key] = {}

    # ---------------------------------------------------------
    # Step 5 – Build per-team district point results
    # ---------------------------------------------------------
    # Structure: team_dp[num][event_key] = points
    team_dp = {num: {} for num in all_numeric}

    for event_key, points in full_dp_map.items():
        for team_key, team_points in points.items():
            try:
                num = int(team_key[3:])
            except:
                continue
            if num in team_dp:
                team_dp[num][event_key] = team_points

    # ---------------------------------------------------------
    # Step 6 – Fetch awards + EPA for each team (parallel)
    # ---------------------------------------------------------
    team_tasks = {
        num: asyncio.gather(
            tba.fetch(f"team/frc{num}/awards", use_backoff=True),
            statbot.get_team_epa_async(num),
        )
        for num in all_numeric
    }

    team_data = {}

    for num, future in team_tasks.items():
        awards, epa = await future

        team_data[num] = {
            "awards": awards or [],
            "epa": epa,
            "district_points": team_dp[num],  # uses expanded DP, not only 2 events
        }

    # ---------------------------------------------------------
    # Step 7 – Build per-event output (same structure as before)
    # ---------------------------------------------------------
    per_event_output = []

    for event in events:
        team_keys = event_team_map[event]
        numeric_teams = sorted(int(t[3:]) for t in team_keys)

        per_event_output.append({
            "event": event,
            "team_count": len(numeric_teams),
            "teams": numeric_teams,
            "data": {num: team_data[num] for num in numeric_teams},
        })

    final_output = {
        "events": events,
        "by_event": per_event_output,
    }

    # ---------------------------------------------------------
    # Step 8 – Cache + return
    # ---------------------------------------------------------
    await db.set_misc(cache_key, json.dumps(final_output))
    return final_output
