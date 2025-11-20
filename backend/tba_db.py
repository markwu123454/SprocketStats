import asyncio
import os
import json
import random
from typing import Any

import httpx
import asyncpg
from dotenv import load_dotenv

load_dotenv()

TBA_KEY = os.getenv("TBA_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

if not TBA_KEY:
    raise EnvironmentError("TBA_KEY missing in environment or .env")

if not DATABASE_URL:
    raise EnvironmentError("DATABASE_URL missing in environment or .env")

TBA_BASE = "https://www.thebluealliance.com/api/v3"
headers = {"X-TBA-Auth-Key": TBA_KEY}


# -------------------------------------------------------------------
# Database Connection Pool
# -------------------------------------------------------------------

async def get_db_pool():
    """
    Creates (or returns existing) asyncpg connection pool.
    Use this in FastAPI startup and pass the pool into your endpoints.
    """
    if not hasattr(get_db_pool, "pool"):
        get_db_pool.pool = await asyncpg.create_pool(DATABASE_URL)
    return get_db_pool.pool


# -------------------------------------------------------------------
# TBA API Helpers (async via httpx)
# -------------------------------------------------------------------

async def fetch(
    path: str,
    *,
    use_backoff: bool = False,
    retries: int = 4,
    base_delay: float = 0.5,
    max_delay: float = 5.0,
    timeout: float = 10.0,
) -> Any:
    """
    Fetch JSON from a TBA API path using GET.
    Example: await tba.fetch("match/2024miket_qm1")
    """

    url = f"{TBA_BASE}/{path}"

    async def _request():
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.json()

    if not use_backoff:
        return await _request()

    # Inline exponential backoff block
    for attempt in range(retries):
        try:
            return await _request()
        except Exception:
            if attempt == retries - 1:
                return None
            sleep_for = min(max_delay, base_delay * (2 ** attempt))
            sleep_for += random.uniform(0, 0.15)
            await asyncio.sleep(sleep_for)

    return None


# -------------------------------------------------------------------
# Database Insert/Update
# -------------------------------------------------------------------

async def cache_match_to_db(match_data: dict, pool: asyncpg.pool.Pool):

    key = match_data["key"]
    event_key = match_data["event_key"]
    comp_level = match_data["comp_level"]
    set_number = match_data.get("set_number")
    match_number = match_data.get("match_number")
    time = match_data.get("time")
    actual_time = match_data.get("actual_time")
    predicted_time = match_data.get("predicted_time")
    post_result_time = match_data.get("post_result_time")
    winning_alliance = match_data.get("winning_alliance")

    red = match_data["alliances"]["red"]
    blue = match_data["alliances"]["blue"]
    red_teams = red["team_keys"]
    blue_teams = blue["team_keys"]
    red_score = red.get("score")
    blue_score = blue.get("score")

    score_breakdown = match_data.get("score_breakdown", {}) or {}
    videos = match_data.get("videos", [])

    red_breakdown = score_breakdown.get("red", {})
    blue_breakdown = score_breakdown.get("blue", {})

    red_rp = red_breakdown.get("rp")
    blue_rp = blue_breakdown.get("rp")
    red_auto = red_breakdown.get("autoPoints")
    blue_auto = blue_breakdown.get("autoPoints")
    red_teleop = red_breakdown.get("teleopPoints")
    blue_teleop = blue_breakdown.get("teleopPoints")
    red_endgame = red_breakdown.get("endGameBargePoints")
    blue_endgame = blue_breakdown.get("endGameBargePoints")

    # ---------- Coopertition Inference ----------
    def infer_coop(b: dict) -> bool:
        if "coopertitionCriteriaMet" in b:
            return bool(b.get("coopertitionCriteriaMet"))
        processor_algae = b.get("wallAlgaeCount", 0)
        return processor_algae >= 2

    red_coop = infer_coop(red_breakdown)
    blue_coop = infer_coop(blue_breakdown)

    sql = """
        INSERT INTO matches_tba (
            match_key, event_key, comp_level, set_number, match_number,
            time, actual_time, predicted_time, post_result_time,
            winning_alliance,
            red_teams, blue_teams,
            red_score, blue_score,
            red_rp, blue_rp,
            red_auto_points, blue_auto_points,
            red_teleop_points, blue_teleop_points,
            red_endgame_points, blue_endgame_points,
            score_breakdown, videos,
            red_coopertition_criteria, blue_coopertition_criteria,
            last_update
        )
        VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9,
            $10,
            $11,$12,
            $13,$14,
            $15,$16,
            $17,$18,
            $19,$20,
            $21,$22,
            $23,$24,
            $25,$26,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (match_key)
        DO UPDATE SET
            red_score = EXCLUDED.red_score,
            blue_score = EXCLUDED.blue_score,
            score_breakdown = EXCLUDED.score_breakdown,
            red_coopertition_criteria = EXCLUDED.red_coopertition_criteria,
            blue_coopertition_criteria = EXCLUDED.blue_coopertition_criteria,
            videos = EXCLUDED.videos,
            last_update = CURRENT_TIMESTAMP;
    """

    async with pool.acquire() as conn:
        await conn.execute(
            sql,
            key, event_key, comp_level, set_number, match_number,
            time, actual_time, predicted_time, post_result_time,
            winning_alliance,
            red_teams, blue_teams,
            red_score, blue_score,
            red_rp, blue_rp,
            red_auto, blue_auto,
            red_teleop, blue_teleop,
            red_endgame, blue_endgame,
            json.dumps(score_breakdown), json.dumps(videos),
            red_coop, blue_coop
        )


# -------------------------------------------------------------------
# Bulk Save for an Event
# -------------------------------------------------------------------

async def cache_event_matches(event_key: str, pool: asyncpg.pool.Pool):
    """
    Fetch all match keys for an event and cache each match in the DB.
    """
    keys = await get_event_match_keys(event_key)

    for key in keys:
        data = await get_tba_match(key)
        await cache_match_to_db(data, pool)

    return keys
