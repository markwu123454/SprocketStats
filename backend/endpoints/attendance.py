from datetime import datetime
from fastapi import Depends, HTTPException, APIRouter
from pydantic import BaseModel

import enums, db

router = APIRouter()

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
