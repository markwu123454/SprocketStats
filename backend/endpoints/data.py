import asyncio
import json
from typing import Optional
from fastapi import Depends, APIRouter

import enums, db, tba_db as tba, statbot_db as statbot

router = APIRouter()

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
