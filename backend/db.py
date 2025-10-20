import asyncpg
import json
import time
import logging
from typing import Dict, Any, Optional, Callable, Annotated
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

async def init_data_db():
    """
    Initialize tables in the 'data' database:
      - match_scouting
      - pit_scouting
      - processed_data
      - users
    Creates indices if missing.
    """
    conn = await get_db_connection(DB_NAME)
    try:
        async with conn.transaction():
            # --- match_scouting table ---
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
                )
            """)
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_match_scouting_team ON match_scouting (team)")
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_ms_lookup
                ON match_scouting (match, match_type, team, scouter)
            """)

            # --- pit_scouting table ---
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS pit_scouting (
                    event_key TEXT NOT NULL,
                    team TEXT NOT NULL,
                    scouter TEXT,
                    status TEXT NOT NULL,
                    data JSONB NOT NULL,
                    last_modified BIGINT NOT NULL,
                    PRIMARY KEY (event_key, team, scouter)
                )
            """)
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_pit_scouting_team ON pit_scouting (team)")
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_pit_lookup
                ON pit_scouting (event_key, team, scouter)
            """)

            # --- processed_data table ---
            await conn.execute("CREATE TABLE IF NOT EXISTS processed_data (data TEXT)")

            # --- users table ---
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS users(
                    name TEXT PRIMARY KEY,
                    passcode_hash TEXT NOT NULL,
                    dev BOOLEAN NOT NULL DEFAULT FALSE,
                    admin BOOLEAN NOT NULL DEFAULT FALSE,
                    match_scouting BOOLEAN NOT NULL DEFAULT FALSE,
                    pit_scouting BOOLEAN NOT NULL DEFAULT FALSE,
                    match_access JSONB NOT NULL DEFAULT '[]'::jsonb
                );
            """)
    except PostgresError as e:
        logger.error("Failed to initialize data schema: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to initialize database: {e}")
    finally:
        await release_db_connection(DB_NAME, conn)


async def init_session_db():
    """Initialize the 'sessions' table in the 'data' database if it does not exist."""
    conn = await get_db_connection(DB_NAME)
    try:
        async with conn.transaction():
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    uuid TEXT PRIMARY KEY,
                    data JSONB NOT NULL,
                    expires TIMESTAMP WITH TIME ZONE NOT NULL
                );
            """)
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires);")
    except PostgresError as e:
        logger.error("Failed to initialize sessions schema: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to initialize sessions schema: {e}")
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

async def get_match_info(
    match_type: str,
    match_number: int,
    set_number: int = 1
) -> Optional[dict]:
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
                  AND match = $1 AND match_type = $2 AND team = $3 AND scouter = $4
                FOR UPDATE
            """, match, m_type.value, str(team), _to_db_scouter(scouter))
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


async def get_pit_scouting(
    team: Optional[int | str] = None,
    scouter: Optional[str] = "__NOTPASSED__",
) -> list[Dict[str, Any]]:
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


async def delete_pit_scouting(
    team: int | str,
    scouter: Optional[str]
) -> bool:
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



# =================== FastAPI dependencies ===================

def require_session() -> Callable[..., enums.SessionInfo]:
    async def dep(x_uuid: Annotated[str, Header(alias="x-uuid")]) -> enums.SessionInfo:
        s = await verify_uuid(x_uuid)
        return enums.SessionInfo(
            email=s["email"],
            name=s["name"],
            permissions=enums.SessionPermissions(**s["permissions"]),
        )
    return dep

def require_permission(required: str) -> Callable[..., enums.SessionInfo]:
    """
    FastAPI dependency: validates an existing session and ensures
    the user has a given permission flag (e.g. 'admin' or 'dev').
    """
    async def dep(session: enums.SessionInfo = Depends(require_session())) -> enums.SessionInfo:
        if not getattr(session.permissions, required, False):
            raise HTTPException(status_code=403, detail=f"Missing '{required}' permission")
        return session
    return dep

