from typing import  Dict, Any
from fastapi import Depends, Body, APIRouter
import db, enums

router = APIRouter()

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
