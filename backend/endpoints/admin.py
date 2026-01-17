import time
from typing import Dict, Any
from fastapi import Depends, HTTPException, APIRouter, Request

import enums, db

router = APIRouter()


# === Admin ===

@router.get("/metadata")
async def get_metadata(_: enums.SessionInfo = Depends(db.require_permission("admin"))):
    return await db.get_metadata()


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
        if not any(e["status"] in {enums.StatusType.PRE.value,
            enums.StatusType.AUTO.value,
            enums.StatusType.TELEOP.value,
            enums.StatusType.POST.value} for e in entries):
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
