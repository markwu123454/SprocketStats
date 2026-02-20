from datetime import datetime
from typing import List
from fastapi import Depends, HTTPException, Body, APIRouter, Query
from pydantic import BaseModel
import db, enums

router = APIRouter()

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
                owned = None
                for t, r in teams.items():
                    if r["scouter"] == scouter_email:
                        owned = t
                        break

                if not owned:
                    # No existing team — just claim the target instead
                    target_row = teams.get(team)
                    target_scouter = target_row["scouter"] if target_row else None
                    if target_scouter is None:
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
                            result, message = "fail", "Failed to claim: database update rejected."
                    else:
                        result, message = "fail", "Target team is already claimed."
                elif owned == team:
                    result, message = "fail", "You already own this team."
                else:
                    switched = await db.switch_match_scouting(
                        match=match, m_type=m_type,
                        old_team=owned, new_team=team,
                        scouter=scouter_email,
                    )
                    if switched:
                        result = "success"
                    else:
                        result, message = "fail", "Switch failed — target may be claimed."


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
        message = f"Internal error while processing request: {e}"

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
        full_data: dict = Body(...),
        session: enums.SessionInfo = Depends(db.require_permission("match_scouting"))
):
    alliance = full_data.pop("alliance")
    full_data.pop("scouter", None)
    full_data.pop("match_type", None)

    # Unwrap nested "data" key if present
    scouting_data = full_data.pop("data", full_data)

    existing = await db.get_match_scouting(
        match=match, m_type=m_type, team=team, scouter=session.email
    )

    if not existing:
        await db.add_match_scouting(
            match=match, m_type=m_type, team=team,
            alliance=alliance, scouter=session.email,
            status=enums.StatusType.POST, data={}
        )

    await db.update_match_scouting(
        match=match, m_type=m_type, team=team,
        scouter=session.email,
        status=enums.StatusType.SUBMITTED,
        data=scouting_data,
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
