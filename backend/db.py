"""
To add a new database function to this module, follow these steps:

1. **Determine purpose and scope**
   - Decide whether the function operates on an existing table (e.g., `match_scouting`, `pit_scouting`, `users`, etc.)
     or requires a new table. If new, define its schema in `init_data_db()`.

2. **Acquire a database connection**
   - Always use:
     ```python
     conn = await get_db_connection(DB_NAME)
     ```
     This ensures the connection pool and JSON codecs are used properly.

3. **Write database logic inside try/finally**
   - Example pattern:
     ```python
     try:
         async with conn.transaction():
             await conn.execute("SQL HERE", params...)
     except PostgresError as e:
         logger.error("Your descriptive message: %s", e)
         raise HTTPException(status_code=500, detail="Your descriptive message")
     finally:
         await release_db_connection(DB_NAME, conn)
     ```
   - Use `fetchrow`, `fetch`, or `execute` depending on the operation.

4. **Handle conflicts and unique constraints**
   - If insertion can collide with existing rows, catch `UniqueViolationError` and raise:
     ```python
     raise HTTPException(status_code=409, detail="Conflict message")
     ```

5. **Maintain consistent patterns**
   - Use `HTTPException` for FastAPI endpoints.
   - Use `_to_db_scouter()` and `_from_db_scouter()` for nullable `scouter` values.
   - Include `time.time_ns()` for modification tracking if applicable.
   - Follow naming convention `add_x`, `update_x`, `get_x`, `delete_x`.

6. **Return structured results**
   - Return lists or dicts with snake_case keys matching database columns.
   - Convert timestamps to ISO strings if user-facing.

7. **Test the new function**
   - Call it from a temporary FastAPI route or REPL with a live database connection.
   - Confirm it correctly handles both success and error conditions.
"""
import socket
import asyncpg
import json
import time
import logging
from typing import Dict, Any, Optional, Callable, Annotated, Awaitable
import dotenv
from fastapi import HTTPException, Header, Depends
from datetime import datetime, timezone
import uuid
from asyncpg import PostgresError
from asyncpg.exceptions import UniqueViolationError
import enums
import os, ssl
import certifi

# ---------- Logging ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------- PostgreSQL settings (single DB) ----------
dotenv.load_dotenv()
DB_DSN = os.getenv("DATABASE_URL")
_pools: dict[str, asyncpg.Pool] = {}
DB_NAME = "data"


S_NONE = "__NONE__"  # sentinel stored when scouter is logically NULL


async def _setup_codecs(conn: asyncpg.Connection):
    """Register JSON and JSONB codecs for transparent dict <-> JSON conversion."""
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    await conn.set_type_codec("json",  encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def get_db_connection(db: str) -> asyncpg.Connection:
    """
    Acquire a connection from a cached pool for the given database.
    Lazily creates a pool if not already initialized.
    Uses DATABASE_URL from environment and SSL (for Neon).
    """
    pool = _pools.get(db)
    if pool is None:
        dsn = os.getenv("DATABASE_URL")
        if not dsn:
            raise RuntimeError("DATABASE_URL not set in environment")
        pool = await asyncpg.create_pool(
            dsn=dsn,
            min_size=1,
            max_size=10,
            init=_setup_codecs,
            ssl=ssl.create_default_context(cafile=certifi.where()),  # Neon requires SSL
        )
        _pools[db] = pool
    return await pool.acquire()


async def release_db_connection(db: str, conn: asyncpg.Connection):
    """Release a connection back to its pool."""
    pool = _pools.get(db)
    if pool is not None:
        await pool.release(conn)


async def close_pool():
    """Close all open database pools and clear the global cache."""
    for pool in _pools.values():
        await pool.close()
    _pools.clear()


def _to_db_scouter(s: Optional[str]) -> str:
    """Convert None scouter value to the sentinel string '__NONE__'."""
    return S_NONE if s is None else s


def _from_db_scouter(s: str) -> Optional[str]:
    """Convert sentinel '__NONE__' string back to None."""
    return None if s == S_NONE else s


# =================== Schema Init ===================

async def init_db():
    """
    Initialize all required tables in the 'data' database
    using the updated schema.
    """

    conn = await get_db_connection(DB_NAME)
    try:
        async with conn.transaction():

            # ---------------------------------------------------
            # match_scouting
            # ---------------------------------------------------
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS match_scouting (
                    event_key TEXT NOT NULL,
                    match INTEGER NOT NULL,
                    match_type TEXT NOT NULL,
                    team TEXT NOT NULL,
                    alliance TEXT NOT NULL,
                    scouter TEXT NOT NULL,
                    status TEXT NOT NULL,
                    data JSONB NOT NULL,
                    last_modified BIGINT NOT NULL,
                    PRIMARY KEY (match, match_type, team, scouter)
                );
            """)
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_match_scouting_team ON match_scouting (team)")
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_ms_lookup
                ON match_scouting (match, match_type, team, scouter);
            """)

            # ---------------------------------------------------
            # pit_scouting
            # ---------------------------------------------------
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS pit_scouting (
                    event_key TEXT NOT NULL,
                    team TEXT NOT NULL,
                    scouter TEXT,
                    status TEXT NOT NULL,
                    data JSONB NOT NULL,
                    last_modified BIGINT NOT NULL,
                    PRIMARY KEY (event_key, team, scouter)
                );
            """)
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_pit_scouting_team ON pit_scouting (team)")
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_pit_lookup
                ON pit_scouting (event_key, team, scouter);
            """)

            # ---------------------------------------------------
            # processed_data
            # ---------------------------------------------------
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS processed_data (
                    event_key TEXT NOT NULL,
                    time_added TIMESTAMPTZ NOT NULL,
                    data JSONB NOT NULL
                );
            """)

            # ---------------------------------------------------
            # matches
            # ---------------------------------------------------
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS matches (
                    key TEXT PRIMARY KEY,
                    event_key TEXT NOT NULL,
                    match_type TEXT NOT NULL,
                    match_number INTEGER,
                    set_number INTEGER,
                    scheduled_time TIMESTAMPTZ,
                    actual_time TIMESTAMPTZ,
                    red1 INTEGER, red2 INTEGER, red3 INTEGER,
                    blue1 INTEGER, blue2 INTEGER, blue3 INTEGER,
                    red1_scouter TEXT, red2_scouter TEXT, red3_scouter TEXT,
                    blue1_scouter TEXT, blue2_scouter TEXT, blue3_scouter TEXT
                );
            """)

            # ---------------------------------------------------
            # matches_tba
            # ---------------------------------------------------
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS matches_tba (
                    match_key TEXT PRIMARY KEY,
                    event_key TEXT NOT NULL,
                    comp_level TEXT NOT NULL,
                    set_number INTEGER,
                    match_number INTEGER,
                    time BIGINT,
                    actual_time BIGINT,
                    predicted_time BIGINT,
                    post_result_time BIGINT,
                    winning_alliance TEXT,
                    red_teams TEXT[] NOT NULL,
                    blue_teams TEXT[] NOT NULL,
                    red_score INTEGER,
                    blue_score INTEGER,
                    red_rp INTEGER,
                    blue_rp INTEGER,
                    red_auto_points INTEGER,
                    blue_auto_points INTEGER,
                    red_teleop_points INTEGER,
                    blue_teleop_points INTEGER,
                    red_endgame_points INTEGER,
                    blue_endgame_points INTEGER,
                    score_breakdown JSONB,
                    videos JSONB,
                    last_update TIMESTAMP,
                    red_coopertition_criteria BOOLEAN,
                    blue_coopertition_criteria BOOLEAN
                );
            """)

            # ---------------------------------------------------
            # metadata
            # ---------------------------------------------------
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS metadata (
                    current_event TEXT
                );
            """)

            # ---------------------------------------------------
            # teams
            # ---------------------------------------------------
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS teams (
                    team_number INTEGER PRIMARY KEY,
                    nickname TEXT,
                    rookie_year INTEGER,
                    last_updated TIMESTAMP
                );
            """)

            # ---------------------------------------------------
            # misc
            # ---------------------------------------------------
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS misc (
                    id INTEGER PRIMARY KEY,
                    candy_cache TEXT
                );
            """)

            # ---------------------------------------------------
            # users
            # ---------------------------------------------------
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    email TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    approval TEXT,
                    perm_dev BOOLEAN NOT NULL DEFAULT FALSE,
                    perm_admin BOOLEAN NOT NULL DEFAULT FALSE,
                    perm_match_scout BOOLEAN NOT NULL DEFAULT FALSE,
                    perm_pit_scout BOOLEAN NOT NULL DEFAULT FALSE,
                    perm_guest_access JSONB NOT NULL DEFAULT '[]'::jsonb,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # ---------------------------------------------------
            # sessions
            # ---------------------------------------------------
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    uuid TEXT PRIMARY KEY,
                    data JSONB NOT NULL,
                    expires TIMESTAMPTZ NOT NULL
                );
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_expires
                ON sessions (expires);
            """)

    except Exception as e:
        logger.error("Failed to initialize schema: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to initialize schema: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


# =================== General Scouting ===================

async def get_team_info(team_number: int) -> Optional[dict]:
    """
    Fetches a single team record from the `teams` table.

    Args:
        team_number: The team number (e.g., 254, 1678, etc.)

    Returns:
        dict with team information, or None if not found.
    """
    conn = await get_db_connection(DB_NAME)
    try:
        row = await conn.fetchrow("""
            SELECT team_number, nickname, rookie_year, last_updated
            FROM teams
            WHERE team_number = $1
            LIMIT 1
        """, team_number)

        if not row:
            return None

        return {
            "team_number": row["team_number"],
            "nickname": row["nickname"],
            "rookie_year": row["rookie_year"],
            "last_updated": row["last_updated"].isoformat() if row["last_updated"] else None,
        }

    except PostgresError as e:
        logger.error("Failed to fetch team info: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch team info: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


# =================== Match Scouting ===================

async def get_match_info(match_type: str, match_number: int, set_number: int = 1) -> Optional[dict]:
    """
    Fetches a single match record from the `matches` table,
    automatically using the current event key from metadata.
    Returns team numbers and times for the current event.
    """
    conn = await get_db_connection(DB_NAME)
    try:
        row = await conn.fetchrow("""
            SELECT *
            FROM matches
            WHERE event_key = (SELECT current_event FROM metadata LIMIT 1)
              AND match_type = $1
              AND match_number = $2
              AND set_number = $3
            LIMIT 1
        """, match_type, match_number, set_number)

        if not row:
            return None

        return {
            "event_key": row["event_key"],
            "match_type": row["match_type"],
            "match_number": row["match_number"],
            "set_number": row["set_number"],
            "scheduled_time": row["scheduled_time"].isoformat() if row["scheduled_time"] else None,
            "actual_time": row["actual_time"].isoformat() if row["actual_time"] else None,
            "red": [row["red1"], row["red2"], row["red3"]],
            "blue": [row["blue1"], row["blue2"], row["blue3"]],
        }

    except PostgresError as e:
        logger.error("Failed to fetch match info: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch match info: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


async def add_match_scouting(
    match: int,
    m_type: enums.MatchType,
    team: int | str,
    alliance: enums.AllianceType,
    scouter: str | None,
    status: enums.StatusType,
    data: Dict[str, Any],
):
    """Insert a new match scouting entry using current_event from metadata."""
    conn = await get_db_connection(DB_NAME)
    try:
        await conn.execute("""
            INSERT INTO match_scouting (
                event_key, match, match_type, team, alliance, scouter, status, data, last_modified
            )
            VALUES (
                (SELECT current_event FROM metadata LIMIT 1),
                $1, $2, $3, $4, $5, $6, $7, $8
            )
        """, match, m_type.value, str(team), alliance.value,
             _to_db_scouter(scouter), status.value, data, time.time_ns())
    except UniqueViolationError:
        raise HTTPException(status_code=409, detail="Match scouting entry already exists")
    except PostgresError as e:
        logger.error("Failed to add match scouting data: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to add match scouting data: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


async def update_match_scouting(
    match: int,
    m_type: enums.MatchType,
    team: int | str,
    scouter: Optional[str],
    status: Optional[enums.StatusType] = None,
    data: Optional[Dict[str, Any]] = None,
    scouter_new: Optional[str] = None,
):
    """
    Update an existing match scouting entry.
    Uses current_event from metadata.
    Raises 404 if entry not found or 409 on conflicting reassignment.
    """
    conn = await get_db_connection(DB_NAME)
    try:
        async with conn.transaction():
            row = await conn.fetchrow("""
                SELECT data, status
                FROM match_scouting
                WHERE event_key = (SELECT current_event FROM metadata LIMIT 1)
                  AND match = $1 AND match_type = $2 AND team = $3 AND (scouter = $4 OR scouter = $5)
                FOR UPDATE
            """, match, m_type.value, str(team), _to_db_scouter(scouter), _to_db_scouter(scouter_new))
            if not row:
                raise HTTPException(status_code=404, detail="Match scouting entry not found")

            current_data: Dict[str, Any] = row["data"]
            if data:
                current_data |= data
            new_status = status.value if status else row["status"]
            new_scouter_db = _to_db_scouter(scouter_new) if scouter_new is not None else _to_db_scouter(scouter)

            try:
                await conn.execute("""
                    UPDATE match_scouting
                    SET data=$1, status=$2, last_modified=$3, scouter=$4
                    WHERE event_key = (SELECT current_event FROM metadata LIMIT 1)
                      AND match = $5 AND match_type = $6 AND team = $7 AND scouter = $8
                """, current_data, new_status, time.time_ns(), new_scouter_db,
                     match, m_type.value, str(team), _to_db_scouter(scouter))
            except UniqueViolationError:
                raise HTTPException(status_code=409, detail="Target scouter row already exists")
            return True
    finally:
        await release_db_connection(DB_NAME, conn)


async def get_match_scouting(
    match: Optional[int] = None,
    m_type: Optional[enums.MatchType] = None,
    team: Optional[int | str] = None,
    scouter: Optional[str] = "__NOTPASSED__",
) -> list[Dict[str, Any]]:
    """
    Fetch match scouting records scoped by current_event from metadata.
    Any combination of parameters can be supplied.
    """
    conn = await get_db_connection(DB_NAME)
    try:
        query = """
            SELECT *
            FROM match_scouting
            WHERE event_key = (SELECT current_event FROM metadata LIMIT 1)
        """
        params: list[Any] = []
        idx = 1

        if match is not None:
            query += f" AND match = ${idx}"; params.append(match); idx += 1
        if m_type is not None:
            query += f" AND match_type = ${idx}"; params.append(m_type.value); idx += 1
        if team is not None:
            query += f" AND team = ${idx}"; params.append(str(team)); idx += 1
        if scouter != "__NOTPASSED__":
            query += f" AND scouter = ${idx}"; params.append(_to_db_scouter(scouter if scouter != "" else None)); idx += 1

        rows = await conn.fetch(query, *params)

        return [
            {
                "event_key": r["event_key"],
                "match": r["match"],
                "match_type": r["match_type"],
                "team": r["team"],
                "alliance": r["alliance"],
                "scouter": _from_db_scouter(r["scouter"]),
                "status": r["status"],
                "data": r["data"],
                "last_modified": r["last_modified"],
            }
            for r in rows
        ]
    except PostgresError as e:
        logger.error("Failed to fetch match scouting data: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch match scouting data: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


async def get_processed_data(event_key: Optional[str] = None) -> Optional[dict]:
    """
    Retrieve the most recent processed_data JSONB entry.
    If event_key is not provided, uses current_event from metadata directly in SQL.
    """
    conn = await get_db_connection(DB_NAME)
    try:
        row = await conn.fetchrow("""
            SELECT data
            FROM processed_data
            WHERE event_key = COALESCE($1, (SELECT current_event FROM metadata LIMIT 1))
            ORDER BY time_added DESC
            LIMIT 1
        """, event_key)

        return row["data"] if row else None

    except PostgresError as e:
        logger.error("Failed to fetch processed data: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch processed data: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


# =================== Pit Scouting ===================

async def add_pit_scouting(
    team: int | str,
    scouter: str | None,
    status: enums.StatusType,
    data: Dict[str, Any],
):
    """Insert a new pit scouting entry using current_event from metadata."""
    conn = await get_db_connection(DB_NAME)
    try:
        await conn.execute("""
            INSERT INTO pit_scouting (
                event_key, team, scouter, status, data, last_modified
            )
            VALUES (
                (SELECT current_event FROM metadata LIMIT 1),
                $1, $2, $3, $4, $5
            )
        """, str(team), _to_db_scouter(scouter), status.value, data, time.time_ns())
    except UniqueViolationError:
        raise HTTPException(status_code=409, detail="Pit scouting entry already exists")
    except PostgresError as e:
        logger.error("Failed to add pit scouting data: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to add pit scouting data: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


async def update_pit_scouting(
    team: int | str,
    scouter: Optional[str],
    status: Optional[enums.StatusType] = None,
    data: Optional[Dict[str, Any]] = None,
    scouter_new: Optional[str] = None,
):
    """
    Update an existing pit scouting entry.
    Uses current_event from metadata.
    Raises 404 if entry not found or 409 on conflicting reassignment.
    """
    conn = await get_db_connection(DB_NAME)
    try:
        async with conn.transaction():
            row = await conn.fetchrow("""
                SELECT data, status
                FROM pit_scouting
                WHERE event_key = (SELECT current_event FROM metadata LIMIT 1)
                  AND team = $1 AND scouter = $2
                FOR UPDATE
            """, str(team), _to_db_scouter(scouter))
            if not row:
                raise HTTPException(status_code=404, detail="Pit scouting entry not found")

            current_data: Dict[str, Any] = row["data"]
            if data:
                current_data |= data
            new_status = status.value if status else row["status"]
            new_scouter_db = _to_db_scouter(scouter_new) if scouter_new is not None else _to_db_scouter(scouter)

            try:
                await conn.execute("""
                    UPDATE pit_scouting
                    SET data=$1, status=$2, last_modified=$3, scouter=$4
                    WHERE event_key = (SELECT current_event FROM metadata LIMIT 1)
                      AND team = $5 AND scouter = $6
                """, current_data, new_status, time.time_ns(), new_scouter_db,
                     str(team), _to_db_scouter(scouter))
            except UniqueViolationError:
                raise HTTPException(status_code=409, detail="Target scouter row already exists")
            return True
    finally:
        await release_db_connection(DB_NAME, conn)


async def get_pit_scouting(team: Optional[int | str] = None, scouter: Optional[str] = "__NOTPASSED__",) -> list[Dict[str, Any]]:
    """
    Fetch pit scouting records scoped by current_event from metadata.
    Any combination of parameters can be supplied.
    """
    conn = await get_db_connection(DB_NAME)
    try:
        query = """
            SELECT *
            FROM pit_scouting
            WHERE event_key = (SELECT current_event FROM metadata LIMIT 1)
        """
        params: list[Any] = []
        idx = 1

        if team is not None:
            query += f" AND team = ${idx}"; params.append(str(team)); idx += 1
        if scouter != "__NOTPASSED__":
            query += f" AND scouter = ${idx}"; params.append(_to_db_scouter(scouter if scouter != "" else None)); idx += 1

        rows = await conn.fetch(query, *params)

        return [
            {
                "event_key": r["event_key"],
                "team": r["team"],
                "scouter": _from_db_scouter(r["scouter"]),
                "status": r["status"],
                "data": r["data"],
                "last_modified": r["last_modified"],
            }
            for r in rows
        ]
    except PostgresError as e:
        logger.error("Failed to fetch pit scouting data: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch pit scouting data: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


async def delete_pit_scouting(team: int | str, scouter: Optional[str]) -> bool:
    """Delete a pit scouting record."""
    conn = await get_db_connection(DB_NAME)
    try:
        result = await conn.execute("""
            DELETE FROM pit_scouting
            WHERE event_key = (SELECT current_event FROM metadata LIMIT 1)
              AND team = $1 AND scouter = $2
        """, str(team), _to_db_scouter(scouter))
        return result == "DELETE 1"
    except PostgresError as e:
        logger.error("Failed to delete pit scouting data: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to delete pit scouting data: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


# =================== TBA data =========================

async def add_tba_match(match_data: dict):
    """
    Insert or update a TBA match record in the `tba_matches` table.
    Used for caching data from The Blue Alliance.

    Args:
        match_data: Full JSON from TBA's /match/{match_key} endpoint.
    """

    conn = await get_db_connection(DB_NAME)
    try:
        async with conn.transaction():
            # Extract core fields
            key = match_data["key"]
            event_key = match_data["event_key"]
            comp_level = match_data["comp_level"]
            set_number = match_data.get("set_number")
            match_number = match_data.get("match_number")
            time_val = match_data.get("time")
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

            score_breakdown = match_data.get("score_breakdown", {})
            videos = match_data.get("videos", [])

            # Extract useful subfields (safe defaults)
            red_rp = score_breakdown.get("red", {}).get("rp")
            blue_rp = score_breakdown.get("blue", {}).get("rp")
            red_auto = score_breakdown.get("red", {}).get("autoPoints")
            blue_auto = score_breakdown.get("blue", {}).get("autoPoints")
            red_teleop = score_breakdown.get("red", {}).get("teleopPoints")
            blue_teleop = score_breakdown.get("blue", {}).get("teleopPoints")
            red_endgame = score_breakdown.get("red", {}).get("endGameBargePoints")
            blue_endgame = score_breakdown.get("blue", {}).get("endGameBargePoints")

            # UPSERT (insert or update existing)
            await conn.execute("""
                INSERT INTO matches_tba (
                    match_key, event_key, comp_level, set_number, match_number,
                    time, actual_time, predicted_time, post_result_time,
                    winning_alliance, red_teams, blue_teams, red_score, blue_score,
                    red_rp, blue_rp, red_auto_points, blue_auto_points,
                    red_teleop_points, blue_teleop_points,
                    red_endgame_points, blue_endgame_points,
                    score_breakdown, videos, last_update
                )
                VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9,
                    $10, $11, $12, $13, $14,
                    $15, $16, $17, $18,
                    $19, $20,
                    $21, $22,
                    $23, $24, NOW()
                )
                ON CONFLICT (match_key) DO UPDATE SET
                    red_score = EXCLUDED.red_score,
                    blue_score = EXCLUDED.blue_score,
                    score_breakdown = EXCLUDED.score_breakdown,
                    videos = EXCLUDED.videos,
                    last_update = NOW();
            """, (
                key, event_key, comp_level, set_number, match_number,
                time_val, actual_time, predicted_time, post_result_time,
                winning_alliance, red_teams, blue_teams, red_score, blue_score,
                red_rp, blue_rp, red_auto, blue_auto,
                red_teleop, blue_teleop,
                red_endgame, blue_endgame,
                json.dumps(score_breakdown), json.dumps(videos)
            ))

    except UniqueViolationError:
        raise HTTPException(status_code=409, detail=f"Match {key} already exists.")
    except PostgresError as e:
        logger.error("Failed to cache TBA match %s: %s", match_data.get("key"), e)
        raise HTTPException(status_code=500, detail="Database error while caching match")
    finally:
        await release_db_connection(DB_NAME, conn)

    return {"status": "ok", "match_key": match_data.get("key")}


async def get_tba_match(match_key: str) -> Optional[dict]:
    """
    Retrieve a single TBA match record from `tba_matches` by match_key.
    Returns None if not found.
    """
    conn = await get_db_connection(DB_NAME)
    try:
        row = await conn.fetchrow("""
            SELECT *
            FROM matches_tba
            WHERE match_key = $1
            LIMIT 1
        """, match_key)

        if not row:
            return None

        return {
            "match_key": row["match_key"],
            "event_key": row["event_key"],
            "comp_level": row["comp_level"],
            "set_number": row["set_number"],
            "match_number": row["match_number"],
            "time": row["time"],
            "actual_time": row["actual_time"],
            "predicted_time": row["predicted_time"],
            "post_result_time": row["post_result_time"],
            "winning_alliance": row["winning_alliance"],
            "red_teams": row["red_teams"],
            "blue_teams": row["blue_teams"],
            "red_score": row["red_score"],
            "blue_score": row["blue_score"],
            "red_rp": row["red_rp"],
            "blue_rp": row["blue_rp"],
            "red_auto_points": row["red_auto_points"],
            "blue_auto_points": row["blue_auto_points"],
            "red_teleop_points": row["red_teleop_points"],
            "blue_teleop_points": row["blue_teleop_points"],
            "red_endgame_points": row["red_endgame_points"],
            "blue_endgame_points": row["blue_endgame_points"],
            "score_breakdown": row["score_breakdown"],
            "videos": row["videos"],
            "last_update": row["last_update"].isoformat() if row["last_update"] else None,
        }

    except PostgresError as e:
        logger.error("Failed to fetch TBA match %s: %s", match_key, e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch TBA match {match_key}: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


async def get_tba_event_matches(event_key: str) -> list[dict]:
    """
    Retrieve all TBA matches for a given event_key.
    Returns an empty list if the event has no cached matches.
    """
    conn = await get_db_connection(DB_NAME)
    try:
        rows = await conn.fetch("""
            SELECT *
            FROM matches_tba
            WHERE event_key = $1
            ORDER BY comp_level, set_number, match_number
        """, event_key)

        return [
            {
                "match_key": r["match_key"],
                "event_key": r["event_key"],
                "comp_level": r["comp_level"],
                "set_number": r["set_number"],
                "match_number": r["match_number"],
                "time": r["time"],
                "actual_time": r["actual_time"],
                "predicted_time": r["predicted_time"],
                "post_result_time": r["post_result_time"],
                "winning_alliance": r["winning_alliance"],
                "red_teams": r["red_teams"],
                "blue_teams": r["blue_teams"],
                "red_score": r["red_score"],
                "blue_score": r["blue_score"],
                "red_rp": r["red_rp"],
                "blue_rp": r["blue_rp"],
                "red_auto_points": r["red_auto_points"],
                "blue_auto_points": r["blue_auto_points"],
                "red_teleop_points": r["red_teleop_points"],
                "blue_teleop_points": r["blue_teleop_points"],
                "red_endgame_points": r["red_endgame_points"],
                "blue_endgame_points": r["blue_endgame_points"],
                "score_breakdown": r["score_breakdown"],
                "videos": r["videos"],
                "last_update": r["last_update"].isoformat() if r["last_update"] else None,
            }
            for r in rows
        ]

    except PostgresError as e:
        logger.error("Failed to fetch matches for event %s: %s", event_key, e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch matches for event {event_key}: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


# =================== Sessions (same DB) ===================

async def add_session(session_id: str, session_data: Dict[str, Any], expires_dt: datetime):
    """
    Insert or update a user session.
    Overwrites if UUID already exists.
    """
    try:
        uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    conn = await get_db_connection(DB_NAME)
    try:
        async with conn.transaction():
            await conn.execute("""
                INSERT INTO sessions (uuid, data, expires)
                VALUES ($1, $2, $3)
                ON CONFLICT (uuid) DO UPDATE
                SET data = EXCLUDED.data, expires = EXCLUDED.expires
            """, session_id, session_data, expires_dt)
    except PostgresError as e:
        logger.error("Failed to add session: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to add session: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


async def get_session_data(session_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve session data for a given UUID. Returns None if not found."""
    try:
        uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    conn = await get_db_connection(DB_NAME)
    try:
        row = await conn.fetchrow("SELECT data FROM sessions WHERE uuid = $1", session_id)
        return row["data"] if row else None
    except PostgresError as e:
        logger.error("Failed to fetch session data: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch session data: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


async def delete_session(session_id: str):
    """Delete a single session by UUID."""
    try:
        uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    conn = await get_db_connection(DB_NAME)
    try:
        await conn.execute("DELETE FROM sessions WHERE uuid = $1", session_id)
    except PostgresError as e:
        logger.error("Failed to delete session: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


async def delete_all_sessions():
    """Delete all rows in the sessions table."""
    conn = await get_db_connection(DB_NAME)
    try:
        await conn.execute("TRUNCATE sessions")
    except PostgresError as e:
        logger.error("Failed to delete all sessions: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to delete all sessions: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


async def verify_uuid(x_uuid: str, required: Optional[str] = None) -> Dict[str, Any]:
    """
    Validate a session UUID and return its session data.
    - Raises 401 if invalid or missing.
    - Raises 403 if expired or lacking required permission.
    """
    try:
        uuid.UUID(x_uuid)
    except ValueError:
        logger.warning("Invalid UUID format")
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    conn = await get_db_connection(DB_NAME)
    try:
        row = await conn.fetchrow(
            "SELECT data, expires FROM sessions WHERE uuid = $1",
            x_uuid,
        )
        if not row:
            raise HTTPException(status_code=401, detail="Invalid session")

        expires: datetime = row["expires"]
        if expires <= datetime.now(timezone.utc):
            await conn.execute("DELETE FROM sessions WHERE uuid = $1", x_uuid)
            raise HTTPException(status_code=403, detail="Expired session")

        session = row["data"]

        if required:
            perms = session.get("permissions", {})
            if not isinstance(perms, dict) or not perms.get(required, False):
                raise HTTPException(status_code=403, detail=f"Missing '{required}' permission")

        return session

    except PostgresError as e:
        logger.error("Database error verifying UUID: %s", e)
        raise HTTPException(status_code=500, detail="Database error verifying UUID")
    finally:
        await release_db_connection(DB_NAME, conn)


async def get_user_by_email(email: str) -> Optional[dict]:
    conn = await get_db_connection(DB_NAME)
    try:
        row = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
        return dict(row) if row else None
    finally:
        await release_db_connection(DB_NAME, conn)


async def create_user_if_missing(email: str, name: str):
    conn = await get_db_connection(DB_NAME)
    try:
        existing = await conn.fetchrow("SELECT email FROM users WHERE email=$1", email)
        if existing:
            return
        await conn.execute("""
            INSERT INTO users (email, name, approval)
            VALUES ($1, $2, 'pending')
        """, email, name)
    finally:
        await release_db_connection(DB_NAME, conn)


async def get_metadata():
    conn = await get_db_connection(DB_NAME)
    try:
        metadata = await conn.fetchrow("SELECT current_event FROM metadata LIMIT 1")
        if metadata:
            return metadata
    finally:
        await release_db_connection(DB_NAME, conn)


async def set_misc(key: str, value: str):
    """
    Ensure a misc column exists for `key`, then store its value in row id=1.
    Dynamically creates new TEXT columns as needed.
    """
    conn = await get_db_connection(DB_NAME)

    # Basic validation: key must be a valid SQL identifier
    if not key.isidentifier():
        raise HTTPException(status_code=400, detail="Invalid key name")

    try:
        async with conn.transaction():

            # 1. Check if column already exists
            col_exists = await conn.fetchval("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'misc'
                      AND column_name = $1
                )
            """, key)

            # 2. Create column if missing
            if not col_exists:
                await conn.execute(f'ALTER TABLE misc ADD COLUMN "{key}" TEXT')

            # 3. Ensure row id=1 exists
            await conn.execute("""
                INSERT INTO misc (id) VALUES (1)
                ON CONFLICT (id) DO NOTHING
            """)

            # 4. Update column
            await conn.execute(
                f'UPDATE misc SET "{key}" = $1 WHERE id = 1',
                value
            )

    except PostgresError as e:
        logger.error("Failed to write misc key: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to write misc key: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


async def get_misc(key: str) -> Optional[str]:
    """
    Retrieve the stored value for a dynamic misc key.
    Returns None if the key or row is missing.
    """
    conn = await get_db_connection(DB_NAME)

    if not key.isidentifier():
        raise HTTPException(status_code=400, detail="Invalid key name")

    try:
        # 1. Confirm column exists
        col_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'misc'
                  AND column_name = $1
            )
        """, key)

        if not col_exists:
            return None

        # 2. Select the column dynamically
        row = await conn.fetchrow(
            f'SELECT "{key}" AS val FROM misc WHERE id = 1'
        )

        return row["val"] if row else None

    except PostgresError as e:
        logger.error("Failed to read misc key: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to read misc key: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


async def measure_db_latency() -> Dict[str, Any]:
    """
    Measure:
      - network latency (TCP handshake RTT to host:5432)
      - database query latency (SELECT 1)
    Returns nanoseconds.
    """

    conn = await get_db_connection(DB_NAME)
    dsn = DB_DSN  # now correctly loaded via :contentReference[oaicite:0]{index=0}
    host = None

    # Parse DSN host
    try:
        if "@" in dsn:
            host_part = dsn.split("@")[-1].split("/")[0]
            if ":" in host_part:
                host, _ = host_part.split(":", 1)
            else:
                host = host_part
    except Exception:
        host = None

    tcp_latency_ns: Optional[int] = None
    db_query_latency_ns: Optional[int] = None

    try:
        # 1. Network latency via raw TCP RTT (forced 5432 for accuracy)
        if host:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            t0 = time.perf_counter_ns()
            try:
                sock.connect((host, 5432))
                tcp_latency_ns = time.perf_counter_ns() - t0
            except Exception:
                tcp_latency_ns = None
            finally:
                sock.close()

        # 2. Database query latency
        t1 = time.perf_counter_ns()
        await conn.execute("SELECT 1;")
        db_query_latency_ns = time.perf_counter_ns() - t1

        # 3. Combined metric if both layers succeeded
        roundtrip_ns = (tcp_latency_ns + db_query_latency_ns) \
                       if tcp_latency_ns is not None and db_query_latency_ns is not None else None

        return {
            "tcp_latency_ns": tcp_latency_ns,
            "db_query_latency_ns": db_query_latency_ns,
            "db_roundtrip_ns": roundtrip_ns,
        }

    except Exception as e:
        logger.error("Latency measurement failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to measure database latency")
    finally:
        await release_db_connection(DB_NAME, conn)


# =================== FastAPI dependencies ===================

def require_session() -> Callable[..., Awaitable[enums.SessionInfo]]:
    async def dep(x_uuid: Annotated[str, Header(alias="x-uuid")]) -> enums.SessionInfo:
        s = await verify_uuid(x_uuid)
        return enums.SessionInfo(
            email=s["email"],
            name=s["name"],
            permissions=enums.SessionPermissions(**s["permissions"]),
        )
    return dep


def require_permission(required: str) -> Callable[..., Awaitable[enums.SessionInfo]]:
    """
    FastAPI dependency: validates an existing session and ensures
    the user has a given permission flag (e.g. 'admin' or 'dev').
    """
    async def dep(session: enums.SessionInfo = Depends(require_session())) -> enums.SessionInfo:
        if not getattr(session.permissions, required, False):
            raise HTTPException(status_code=403, detail=f"Missing '{required}' permission")
        return session
    return dep
