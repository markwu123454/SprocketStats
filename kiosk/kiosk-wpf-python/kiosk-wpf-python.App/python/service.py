"""
Database Manager for Scouting Application (JSON-over-stdio version)
====================================================================

This module provides database connectivity, data download/upload functionality,
and calculation processing for FRC scouting data stored in PostgreSQL.

Communication: JSON over stdin/stdout for C# integration
Real-time logging: Emits log events during execution for streaming output

Key Components:
    - Database connection management with SSL
    - Data download from multiple scouting tables
    - Data upload to processed_data table
    - Database schema validation
    - Async operation support via JSON commands
    - Real-time log streaming
"""

import asyncio
import asyncpg
import certifi
import dotenv
import json
import requests
import numpy
import os
import ssl
import sys
import time
import traceback
import types
import statbotics

FRCScoreTracker = ScoreRegionConfig = None

# ============================================================================
# GLOBAL STATE & CONFIGURATION
# ============================================================================

# Single event loop for all async operations
_loop = asyncio.new_event_loop()
asyncio.set_event_loop(_loop)

DATABASE_KEY = ""  # PostgreSQL connection string (DSN)
TBA_API_KEY = ""

# Expected database schema - maps table names to their required columns
DATABASE_SCHEMA = {
    "match_scouting": {
        "match", "match_type", "team", "alliance", "scouter",
        "status", "data", "last_modified", "event_key"
    },
    "matches": {
        "key", "event_key", "match_type", "match_number",
        "set_number", "scheduled_time", "actual_time",
        "red1", "red2", "red3", "blue1", "blue2", "blue3"
    },
    "matches_tba": {
        "match_key", "event_key", "match_number",
        "winning_alliance", "red_teams", "blue_teams",
        "red_score", "blue_score",
        "red_rp", "blue_rp",
        "red_auto_points", "blue_auto_points",
        "red_teleop_points", "blue_teleop_points",
        "red_endgame_points", "blue_endgame_points",
        "score_breakdown", "videos",
        "red_coopertition_criteria", "blue_coopertition_criteria"
    },
    "pit_scouting": {
        "event_key", "team", "scouter",
        "status", "data", "last_modified"
    },
    "processed_data": {
        "event_key", "time_added", "data"
    }
}

# Data storage - populated by download_data(), consumed by calculations
downloaded_data = {}

# Calculation results - populated by run_calculation(), consumed by upload_data()
calc_result = {"result": {}}

sb = statbotics.Statbotics()

REPL_GLOBALS = globals()

# ============================================================================
# LOGGING & OUTPUT
# ============================================================================

# Configure stderr to be unbuffered for real-time logging
sys.stderr.reconfigure(line_buffering=True)

def log(*args, sep=" ", end="\n", file=None, flush=False):
    """
    Print-compatible logger.
    Behaves like print(), but always writes to stderr.
    """
    text = sep.join(map(str, args))
    if text or end.strip():
        sys.stderr.write(text + end)
        if flush:
            sys.stderr.flush()



# ============================================================================
# DATABASE CONNECTION
# ============================================================================

async def get_connection():
    """
    Create and configure a PostgreSQL database connection.

    Returns:
        asyncpg.Connection: Configured database connection with SSL and JSON codecs
    """
    if not DATABASE_KEY:
        raise RuntimeError("DATABASE_KEY not set")

    ssl_context = ssl.create_default_context(cafile=certifi.where())
    conn = await asyncpg.connect(dsn=DATABASE_KEY, ssl=ssl_context)

    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog"
    )
    await conn.set_type_codec(
        "json",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog"
    )

    return conn


async def verify_db():
    """
    Validate database connectivity and schema integrity.

    Returns:
        tuple: (ok: bool, errors: list[str])
    """
    global DATABASE_KEY, DATABASE_SCHEMA

    errors: list[str] = []

    if not DATABASE_KEY:
        return False, ["DATABASE_KEY is not set"]

    if not isinstance(DATABASE_SCHEMA, dict) or not DATABASE_SCHEMA:
        return False, ["DATABASE_SCHEMA is not defined or empty"]

    conn = None
    try:
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        conn = await asyncpg.connect(dsn=DATABASE_KEY, ssl=ssl_context)

        rows = await conn.fetch("""
                                SELECT table_name
                                FROM information_schema.tables
                                WHERE table_schema = 'public';
                                """)
        existing_tables = {r["table_name"] for r in rows}

        for table in DATABASE_SCHEMA:
            if table not in existing_tables:
                errors.append(f"Missing table: {table}")

        for table, required_cols in DATABASE_SCHEMA.items():
            if table not in existing_tables:
                continue

            col_rows = await conn.fetch("""
                                        SELECT column_name
                                        FROM information_schema.columns
                                        WHERE table_schema = 'public'
                                          AND table_name = $1;
                                        """, table)

            existing_cols = {r["column_name"] for r in col_rows}
            missing = set(required_cols) - existing_cols

            if missing:
                errors.append(
                    f"{table}: missing columns: {', '.join(sorted(missing))}"
                )

        return len(errors) == 0, errors

    except asyncpg.InvalidPasswordError:
        return False, ["Authentication failed"]
    except asyncpg.InvalidAuthorizationSpecificationError:
        return False, ["Authorization failed"]
    except asyncpg.PostgresError as e:
        return False, [f"Postgres error: {e}"]
    except Exception as e:
        return False, [f"Unexpected error: {e}"]
    finally:
        if conn:
            await conn.close()


# ============================================================================
# INITIALIZATION
# ============================================================================

def python_init():
    """Initialize the Python environment and validate database connectivity."""
    global DATABASE_KEY, TBA_API_KEY, FRCScoreTracker, ScoreRegionConfig

    has_errored = False
    got_db_key = False
    errors = []
    warnings = []

    log("Loading... Checking environment")

    try:
        env_path = dotenv.find_dotenv()
        dotenv.load_dotenv(env_path, override=True)
        DATABASE_KEY = os.getenv("DATABASE_KEY")
        TBA_API_KEY = os.getenv("TBA_API_KEY")

        if not DATABASE_KEY:
            errors.append("DATABASE_KEY is missing from .env file")
            has_errored = True
        elif not TBA_API_KEY:
            errors.append("TBA_API_KEY is missing from .env file")
            has_errored = True
        else:
            got_db_key = True
    except Exception as e:
        errors.append(str(e))
        has_errored = True

    log("Loading... Checking dependencies")

    missing_packages = []
    try:
        import cv2
    except Exception as e:
        missing_packages.append(f"opencv-python (import failed: {e})")

    try:
        import pytesseract
    except ImportError:
        missing_packages.append("pytesseract")

    try:
        import PIL
    except ImportError:
        missing_packages.append("Pillow")

    try:
        import yt_dlp
    except ImportError:
        missing_packages.append("yt-dlp")

    if missing_packages:
        errors.append(f"Missing Python packages: {', '.join(missing_packages)}")
        has_errored = True

    log("Loading... Checking database")

    try:
        if got_db_key:
            ok, db_errors = _loop.run_until_complete(verify_db())
            if not ok:
                errors.extend(db_errors)
                has_errored = True
        else:
            errors.append("Database validation skipped (missing DATABASE_KEY)")
            has_errored = True
    except Exception as e:
        errors.append(f"verify_db failed: {e}")
        has_errored = True

    log("Done.")
    time.sleep(1)
    log("\x1b[J")
    _print_banner()

    if not has_errored:
        log("\x1b[32mInitialization complete.\x1b[0m")
        try:
            from frc_score_tracker_lib import FRCScoreTracker as _Tracker, ScoreRegionConfig as _Config
            FRCScoreTracker = _Tracker
            ScoreRegionConfig = _Config
        except ImportError:
            warnings.append("FRC score tracker library not available")
    else:
        for err in errors:
            log(f"\x1b[31mERROR: {err}\x1b[0m")
        log("\x1b[33mInitialization complete with errors.\x1b[0m")

    return {"errors": errors, "warnings": warnings, "success": not has_errored}


def _print_banner():
    log("\x1b[35m $$$$$$\  $$$$$$$\  $$$$$$$\   $$$$$$\   $$$$$$\  $$\   $$\ $$$$$$$$\ $$$$$$$$\   $$$$$$\ $$$$$$$$\  $$$$$$\ $$$$$$$$\  $$$$$$\  \x1b[0m")
    log("\x1b[35m$$  __$$\ $$  __$$\ $$  __$$\ $$  __$$\ $$  __$$\ $$ | $$  |$$  _____|\__$$  __| $$  __$$\\\__$$  __|$$  __$$\\\__$$  __|$$  __$$\ \x1b[0m")
    log("\x1b[35m$$ /  \__|$$ |  $$ |$$ |  $$ |$$ /  $$ |$$ /  \__|$$ |$$  / $$ |         $$ |    $$ /  \__|  $$ |   $$ /  $$ |  $$ |   $$ /  \__|\x1b[0m")
    log("\x1b[35m\$$$$$$\  $$$$$$$  |$$$$$$$  |$$ |  $$ |$$ |      $$$$$  /  $$$$$\       $$ |    \$$$$$$\    $$ |   $$$$$$$$ |  $$ |   \$$$$$$\  \x1b[0m")
    log("\x1b[35m \____$$\ $$  ____/ $$  __$$< $$ |  $$ |$$ |      $$  $$<   $$  __|      $$ |     \____$$\   $$ |   $$  __$$ |  $$ |    \____$$\ \x1b[0m")
    log("\x1b[35m$$\   $$ |$$ |      $$ |  $$ |$$ |  $$ |$$ |  $$\ $$ |\$$\  $$ |         $$ |    $$\   $$ |  $$ |   $$ |  $$ |  $$ |   $$\   $$ |\x1b[0m")
    log("\x1b[35m\$$$$$$  |$$ |      $$ |  $$ | $$$$$$  |\$$$$$$  |$$ | \$$\ $$$$$$$$\    $$ |    \$$$$$$  |  $$ |   $$ |  $$ |  $$ |   \$$$$$$  |\x1b[0m")
    log("\x1b[35m \______/ \__|      \__|  \__| \______/  \______/ \__|  \__|\________|   \__|     \______/   \__|   \__|  \__|  \__|    \______/\x1b[0m")


# ============================================================================
# DATA OPERATIONS
# ============================================================================

async def download_data(event_key):
    """Download scouting data from the database."""
    global downloaded_data

    log("\n=== START DOWNLOAD ===")

    try:
        log(" Connecting to database...")
        conn = await get_connection()
        log(" Database connected")

        event_name = event_key or 'all events'
        log(f" Fetching data from \x1b[36m{event_name}\x1b[0m...")
        event_filter = f"%{event_key}%" if event_key else None

        # Match scouting data
        log(" Fetching match data...")
        match_query = """
                      SELECT event_key, match, match_type, team, alliance, scouter, data
                      FROM match_scouting
                      WHERE status = 'submitted' """

        if event_filter:
            match_query += " AND event_key LIKE $1"
            rows = await conn.fetch(match_query, event_filter)
        else:
            match_query += " ORDER BY match_type, match, alliance, team"
            rows = await conn.fetch(match_query)

        match = [dict(r) for r in rows]
        robot_entries = len(match)
        match_count = len({
            (r["event_key"], r["match_type"], r["match"])
            for r in match
        })
        log(f"  \x1b[33m{robot_entries}\x1b[0m robot entries from \x1b[33m{match_count}\x1b[0m matches")

        # Pit scouting data
        log(" Fetching team data...")
        pit_query = """
                    SELECT event_key, team, scouter, data
                    FROM pit_scouting
                    WHERE status = 'submitted' """

        if event_filter:
            pit_query += " AND event_key ILIKE $1"
            rows = await conn.fetch(pit_query, event_filter)
        else:
            pit_query += " ORDER BY team, scouter"
            rows = await conn.fetch(pit_query)

        pit = [dict(r) for r in rows]
        log(f"  \x1b[33m{len(pit)}\x1b[0m pit entries")

        # Match schedules
        log(" Fetching match schedules...")
        schedule_query = """
                         SELECT key, event_key, match_type, match_number, set_number,
                             scheduled_time, actual_time,
                             red1, red2, red3, blue1, blue2, blue3
                         FROM matches """

        if event_filter:
            schedule_query += " WHERE event_key ILIKE $1"
            rows = await conn.fetch(schedule_query, event_filter)
        else:
            schedule_query += " ORDER BY event_key, match_type, match_number"
            rows = await conn.fetch(schedule_query)

        all_matches = [dict(r) for r in rows]
        log(f"  \x1b[33m{len(all_matches)}\x1b[0m schedule entries")

        downloaded_data = {
            "match_scouting": match,
            "pit_scouting": pit,
            "all_matches": all_matches,
        }

        total_records = robot_entries + len(pit) + len(all_matches)
        await conn.close()
        log(f" Done - \x1b[33m{total_records}\x1b[0m total records\n")

        return {"success": True, "records": total_records}

    except Exception as e:
        log(f"\x1b[31mError: {e}\x1b[0m")
        return {"success": False, "error": str(e)}


async def upload_data(event_key):
    """Upload calculation results to the database."""
    log("\n=== START UPLOAD ===")

    if not calc_result or "result" not in calc_result:
        log("\x1b[31mError: No calculator output found. Run calculation first.\x1b[0m")
        return {"success": False, "error": "No calculation results"}

    try:
        log(" Connecting to database...")
        conn = await get_connection()
        log(" Database connected")

        if not event_key:
            log("\x1b[31mError: Event key is required for upload\x1b[0m")
            return {"success": False, "error": "Event key required"}

        log(f" Uploading to \x1b[36m{event_key}\x1b[0m...")

        await conn.execute(
            "INSERT INTO processed_data (event_key, data) VALUES ($1, $2)",
            event_key,
            json.dumps(calc_result["result"]),
        )

        result = calc_result["result"]
        record_count = len(result) if isinstance(result, (list, dict)) else 1
        log(f"  \x1b[33m{record_count}\x1b[0m records uploaded")

        await conn.close()
        log(" Done\n")

        return {"success": True, "records": record_count}

    except Exception as e:
        log(f"\x1b[31mError: {e}\x1b[0m")
        return {"success": False, "error": str(e)}


# ============================================================================
# CALCULATION ENGINE
# ============================================================================

def run_calculation(setting):
    """Execute scouting data calculations."""
    global calc_result, downloaded_data

    log("\n=== START CALCULATION ===")
    log("Output data is in calc_result")

    try:
        setting = json.loads(setting) if isinstance(setting, str) else setting

        if not setting.get("event_key"):
            log("\x1b[31mError: Event key is required\x1b[0m")
            return {"success": False, "error": "Event key required"}

        event_key = setting["event_key"]
        stop_on_warning = setting.get("stop_on_warning", False)

        log(f" Running calculations for \x1b[36m{event_key}\x1b[0m...")
        if stop_on_warning:
            log("   (stop on warning: \x1b[33menabled\x1b[0m)")

        log(" Validating downloaded data...")
        if not validate_downloaded_data(event_key, stop_on_warning):
            return {"success": False, "error": "Data validation failed"}

        log(" Fetching Statbotics data...")
        try:
            sb_data = sb.get_matches(event=event_key)
            sb_count = len(sb_data) if isinstance(sb_data, (list, dict)) else 0

            if sb_count == 0:
                log("   \x1b[31mWarning: No Statbotics data returned\x1b[0m")
                if stop_on_warning:
                    return {"success": False, "error": "No Statbotics data"}
            else:
                log(f"   \x1b[33m{sb_count}\x1b[0m Statbotics entries")

        except UserWarning as e:
            log(f"   \x1b[31mStatbotics error: {e}\x1b[0m")
            if stop_on_warning:
                return {"success": False, "error": f"Statbotics error: {e}"}
            sb_data = {}

        log(" Fetching TBA data...")
        tba_response = requests.get(
            f"https://www.thebluealliance.com/api/v3/event/{event_key}/matches",
            headers={"X-TBA-Auth-Key": TBA_API_KEY}
        )

        if tba_response.status_code != 200:
            log(f"   \x1b[31mTBA request failed (status {tba_response.status_code})\x1b[0m")
            if stop_on_warning:
                return {"success": False, "error": "TBA request failed"}
            tba_data = []
        else:
            tba_data = tba_response.json()
            if not tba_data:
                log("   \x1b[31mWarning: No TBA matches returned\x1b[0m")
                if stop_on_warning:
                    return {"success": False, "error": "No TBA data"}
            else:
                log(f"   \x1b[33m{len(tba_data)}\x1b[0m TBA matches")

        log(" Initializing calculation results...")
        calc_result.clear()
        calc_result["ranking"] = {}
        calc_result["alliance"] = {}
        calc_result["sb"] = sb_data
        calc_result["tba"] = tba_data

        if not initialize_structure(
                calc_result=calc_result,
                tba_data=tba_data,
                sb_data=sb_data,
                downloaded_data=downloaded_data,
                event_key=event_key,
                stop_on_warning=stop_on_warning
        ):
            return {"success": False, "error": "Structure initialization failed"}

        log("\x1b[33mNo calculations yet.\x1b[0m")
        log(" Done\n")

        return {"success": True}

    except Exception as e:
        log(f"\x1b[31mError: {e}\x1b[0m")
        return {"success": False, "error": str(e)}


def validate_downloaded_data(event_key, stop_on_warning=False):
    """Validate that downloaded_data contains necessary information."""
    global downloaded_data

    if not downloaded_data:
        log("   \x1b[31mError: No data downloaded. Run download_data() first.\x1b[0m")
        return False

    required_keys = ["match_scouting", "pit_scouting", "all_matches"]
    missing_keys = [k for k in required_keys if k not in downloaded_data]

    if missing_keys:
        log(f"   \x1b[31mError: Missing data keys: {', '.join(missing_keys)}\x1b[0m")
        return False

    match_scouting = [
        m for m in downloaded_data["match_scouting"]
        if m.get("event_key") == event_key
    ]
    pit_scouting = [
        p for p in downloaded_data["pit_scouting"]
        if p.get("event_key") == event_key
    ]
    all_matches = [
        m for m in downloaded_data["all_matches"]
        if m.get("event_key") == event_key
    ]

    log(f"   Match scouting entries: \x1b[33m{len(match_scouting)}\x1b[0m")
    log(f"   Pit scouting entries: \x1b[33m{len(pit_scouting)}\x1b[0m")
    log(f"   Match schedules: \x1b[33m{len(all_matches)}\x1b[0m")

    if len(match_scouting) == 0:
        log("   \x1b[31mWarning: No match scouting data for this event\x1b[0m")
        if stop_on_warning:
            return False

    if len(all_matches) == 0:
        log("   \x1b[31mWarning: No match schedules for this event\x1b[0m")
        if stop_on_warning:
            return False

    return True


def initialize_structure(calc_result, tba_data, sb_data, downloaded_data, event_key, stop_on_warning=False):
    """Initialize empty calculation structures for teams and matches."""

    sb_matches = {}
    if isinstance(sb_data, dict):
        sb_matches = sb_data
    elif isinstance(sb_data, list):
        for m in sb_data:
            if "key" in m:
                sb_matches[m["key"]] = m

    calc_result["team"] = {}
    calc_result["match"] = {}
    calc_result["match_index"] = {}
    calc_result["match_reverse_index"] = {}

    log(" Initializing teams and matches from TBA...")

    tba_match_keys = {m["key"] for m in tba_data if "key" in m}
    grouped = {"qm": [], "sf": [], "f": []}

    for match in tba_data:
        level = match.get("comp_level")
        if level in grouped:
            grouped[level].append(match)

        alliances = match.get("alliances", {})
        for color in ("red", "blue"):
            for raw_team_key in alliances.get(color, {}).get("team_keys", []):
                team_num = parse_team_key(raw_team_key)
                calc_result["team"].setdefault(team_num, {})

    for level in ("qm", "sf", "f"):
        matches = sorted(
            grouped[level],
            key=lambda m: (m.get("set_number", 0), m.get("match_number", 0))
        )

        for idx, match in enumerate(matches, start=1):
            canon_key = f"{level}{idx}"
            tba_key = match["key"]

            calc_result["match"][canon_key] = {}
            calc_result["match_index"][canon_key] = tba_key
            calc_result["match_reverse_index"][tba_key] = canon_key

    log(f"   Initialized \x1b[33m{len(calc_result['match'])}\x1b[0m matches")
    log(f"   Initialized \x1b[33m{len(calc_result['team'])}\x1b[0m teams")

    sb_match_keys = set(sb_matches.keys())
    missing_in_sb = tba_match_keys - sb_match_keys
    extra_in_sb = sb_match_keys - tba_match_keys

    if missing_in_sb:
        log(f"\x1b[31mWarning: {len(missing_in_sb)} TBA matches missing in Statbotics\x1b[0m")
        if stop_on_warning:
            return False

    if extra_in_sb:
        log(f"\x1b[31mWarning: {len(extra_in_sb)} Statbotics matches not in TBA\x1b[0m")
        if stop_on_warning:
            return False

    log(" Validating against downloaded data...")

    match_scouting = [
        m for m in downloaded_data.get("match_scouting", [])
        if m.get("event_key") == event_key
    ]

    most_recent = determine_most_recent_match(match_scouting, calc_result)
    if most_recent:
        calc_result["most_recent_match"] = most_recent
        log(f"   Most recent match (>3 submissions): \x1b[32m{most_recent}\x1b[0m")
    else:
        log("   \x1b[33mNo match with >3 submissions found\x1b[0m")

    log(" Structure initialization complete\n")
    return True


def determine_most_recent_match(match_scouting, calc_result):
    """Determine the most recent match based on submissions."""
    submission_counts = {}

    for entry in match_scouting:
        match_type = entry.get("match_type", "")
        match_num = entry.get("match", 0)
        match_id = f"{match_type}{match_num}"
        submission_counts[match_id] = submission_counts.get(match_id, 0) + 1

    qualifying_matches = []

    for match_id, count in submission_counts.items():
        if count > 3:
            tba_key = None
            for tba_k, canon_k in calc_result.get("match_reverse_index", {}).items():
                if tba_k.endswith(f"_{match_id}"):
                    tba_key = tba_k
                    break

            if tba_key:
                canon_key = calc_result["match_reverse_index"][tba_key]
                qualifying_matches.append((canon_key, count))

    if not qualifying_matches:
        return None

    def match_sort_key(item):
        canon_key = item[0]
        if canon_key.startswith("f"):
            level = 2
        elif canon_key.startswith("sf"):
            level = 1
        else:
            level = 0
        num = int(''.join(filter(str.isdigit, canon_key)))
        return (level, num)

    qualifying_matches.sort(key=match_sort_key, reverse=True)
    return qualifying_matches[0][0]


def parse_team_key(team_key):
    """Convert a TBA or Statbotics team key into an integer team number."""
    if isinstance(team_key, int):
        return team_key
    if isinstance(team_key, str):
        if team_key.startswith("frc"):
            return int(team_key[3:])
        if team_key.isdigit():
            return int(team_key)
    raise ValueError(f"Unrecognized team key format: {team_key}")


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def list_globals():
    """List all functions and variables in the global scope."""
    functions = []
    classes = []
    variables = []

    for name, obj in globals().items():
        if name.startswith('_'):
            continue
        if isinstance(obj, types.ModuleType):
            continue

        if isinstance(obj, types.FunctionType):
            functions.append(name)
        elif isinstance(obj, type):
            classes.append(name)
        else:
            variables.append(name)

    result = {"functions": sorted(functions), "classes": sorted(classes), "variables": sorted(variables)}
    return result


# ============================================================================
# JSON COMMAND INTERFACE
# ============================================================================

def _ok(**kwargs):
    """Helper to create success response."""
    return {"success": True, **kwargs}


def _err(msg):
    """Helper to create error response."""
    return {"success": False, "error": msg}


def exec_or_eval(code: str):
    try:
        REPL_GLOBALS["print"] = log  # redirect print  log

        try:
            result = eval(code, REPL_GLOBALS, REPL_GLOBALS)
        except SyntaxError:
            exec(code, REPL_GLOBALS, REPL_GLOBALS)
            result = None

        return _ok(log=str(result) if result is not None else None)
    except Exception:
        return _err(traceback.format_exc())


def handle(req: dict):
    """Handle incoming JSON commands."""
    cmd = req.get("cmd")

    if cmd == "ping":
        return _ok(log="Python ready")

    if cmd == "init":
        result = python_init()
        return result

    if cmd == "exec":
        return exec_or_eval(req.get("code", ""))

    if cmd == "call_async":
        coro_name = req.get("name")
        args = req.get("args", [])
        func = globals().get(coro_name)

        if not func or not asyncio.iscoroutinefunction(func):
            return _err(f"{coro_name} is not async")

        try:
            result = _loop.run_until_complete(func(*args))
            return _ok(result=result)
        except Exception:
            return _err(traceback.format_exc())

    if cmd == "download_data":
        event_key = req.get("event_key")
        result = _loop.run_until_complete(download_data(event_key))
        return result

    if cmd == "upload_data":
        event_key = req.get("event_key")
        result = _loop.run_until_complete(upload_data(event_key))
        return result

    if cmd == "run_calculation":
        setting = req.get("setting", {})
        result = run_calculation(setting)
        return result

    if cmd == "verify_db":
        ok, errors = _loop.run_until_complete(verify_db())
        return _ok(valid=ok, errors=errors)

    if cmd == "list_globals":
        result = list_globals()
        return _ok(**result)

    if cmd == "get_data":
        data_type = req.get("type")
        if data_type == "downloaded":
            return _ok(data=downloaded_data)
        elif data_type == "calc_result":
            return _ok(data=calc_result)
        else:
            return _err(f"Unknown data type: {data_type}")

    return _err(f"Unknown command: {cmd}")


# ============================================================================
# MAIN LOOP (JSON over stdio)
# ============================================================================

def main():
    """Main loop reading JSON commands from stdin."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
            res = handle(req)
        except Exception:
            res = _err(traceback.format_exc())

        # Emit the final response
        sys.stdout.write(json.dumps(res) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()