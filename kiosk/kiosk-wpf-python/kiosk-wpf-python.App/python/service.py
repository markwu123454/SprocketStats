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


# -- Semantic ANSI log helpers ----------------------------------------------

_RESET   = "\x1b[0m"
_BOLD    = "\x1b[1m"
_DIM     = "\x1b[38;5;245m"
_RED     = "\x1b[1;31m"
_GREEN   = "\x1b[1;32m"
_YELLOW  = "\x1b[1;33m"
_BLUE    = "\x1b[1;34m"
_MAGENTA = "\x1b[1;35m"
_PURPLE  = "\x1b[38;2;145;92;201m"
_CYAN    = "\x1b[1;36m"
_WHITE   = "\x1b[1;37m"

_BAR = "=" * 44


def log_header(title):
    """Print a prominent section header."""
    log(f"\n{_PURPLE}{_BAR}")
    log(f"  {title}")
    log(f"{_PURPLE}{_BAR}{_RESET}")


def log_step(msg):
    """Print a top-level action step."""
    log(f"  {_BLUE}>{_RESET} {msg}")


def log_substep(msg):
    """Print an indented sub-detail."""
    log(f"    {_DIM}|_{_RESET} {msg}")


def log_stat(label, value, indent=4):
    """Print a key -> value statistic."""
    pad = " " * indent
    log(f"{pad}{_DIM}{label}:{_RESET} {_YELLOW}{value}{_RESET}")


def log_success(msg):
    """Print a success message."""
    log(f"  {_GREEN}[OK]{_RESET} {msg}")


def log_warn(msg):
    """Print a warning message."""
    log(f"  {_YELLOW}[!!]{_RESET} {msg}")


def log_error(msg):
    """Print an error message."""
    log(f"  {_RED}[ERR]{_RESET} {msg}")


def log_done(summary=None):
    """Print a section footer, optionally with a summary line."""
    if summary:
        log(f"\n{_GREEN}{_BAR}")
        log(f"  [OK] Done -- {summary}")
        log(f"{_GREEN}{_BAR}{_RESET}\n")
    else:
        log(f"\n{_GREEN}{_BAR}")
        log(f"  [OK] Done")
        log(f"{_BAR}{_RESET}\n")


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

    log_header("INITIALIZATION")

    # -- Environment --------------------------------------------------------
    log_step("Checking environment...")

    try:
        env_path = dotenv.find_dotenv()
        dotenv.load_dotenv(env_path, override=True)
        DATABASE_KEY = os.getenv("DATABASE_KEY")
        TBA_API_KEY = os.getenv("TBA_API_KEY")

        if not DATABASE_KEY:
            errors.append("DATABASE_KEY is missing from .env file")
            has_errored = True
            log_error("DATABASE_KEY is missing")
        elif not TBA_API_KEY:
            errors.append("TBA_API_KEY is missing from .env file")
            has_errored = True
            log_error("TBA_API_KEY is missing")
        else:
            got_db_key = True
            log_success("Environment loaded")
    except Exception as e:
        errors.append(str(e))
        has_errored = True
        log_error(f"Environment error: {e}")

    # -- Dependencies -------------------------------------------------------
    log_step("Checking dependencies...")

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
        for pkg in missing_packages:
            log_warn(f"Missing: {_CYAN}{pkg}{_RESET}")
    else:
        log_success("All dependencies found")

    # -- Database -----------------------------------------------------------
    log_step("Checking database...")

    try:
        if got_db_key:
            ok, db_errors = _loop.run_until_complete(verify_db())
            if not ok:
                errors.extend(db_errors)
                has_errored = True
                for err in db_errors:
                    log_error(err)
            else:
                log_success("Database schema verified")
        else:
            errors.append("Database validation skipped (missing DATABASE_KEY)")
            has_errored = True
            log_warn("Database validation skipped")
    except Exception as e:
        errors.append(f"verify_db failed: {e}")
        has_errored = True
        log_error(f"verify_db failed: {e}")

    # -- Score tracker library ----------------------------------------------
    if not has_errored:
        try:
            from frc_score_tracker_lib import FRCScoreTracker as _Tracker, ScoreRegionConfig as _Config
            FRCScoreTracker = _Tracker
            ScoreRegionConfig = _Config
            log_success("FRC score tracker loaded")
        except ImportError:
            warnings.append("FRC score tracker library not available")
            log_warn("FRC score tracker library not available")

    # -- Banner & summary --------------------------------------------------
    time.sleep(1)
    log(f"\x1b[2J{_DIM}v26.1.0 pre.1{_RESET}")
    _print_banner()
    log("")
    log(f"  {_DIM}Use list_globals() to see available functions{_RESET}")
    log("")

    if has_errored:
        for err in errors:
            log_error(err)
        log(f"\n  {_YELLOW}[!!] Initialization complete with errors{_RESET}\n")
    else:
        log(f"  {_GREEN}[OK] Initialization complete{_RESET}\n")

    return {"errors": errors, "warnings": warnings, "success": not has_errored}


def _print_banner():
    log(f"{_PURPLE} $$$$$$\\  $$$$$$$\\  $$$$$$$\\   $$$$$$\\   $$$$$$\\  $$\\   $$\\ $$$$$$$$\\ $$$$$$$$\\   $$$$$$\\ $$$$$$$$\\  $$$$$$\\ $$$$$$$$\\  $$$$$$\\  {_RESET}")
    log(f"{_PURPLE}$$  __$$\\ $$  __$$\\ $$  __$$\\ $$  __$$\\ $$  __$$\\ $$ | $$  |$$  _____|\\__$$  __| $$  __$$\\\\__$$  __|$$  __$$\\\\__$$  __|$$  __$$\\ {_RESET}")
    log(f"{_PURPLE}$$ /  \\__|$$ |  $$ |$$ |  $$ |$$ /  $$ |$$ /  \\__|$$ |$$  / $$ |         $$ |    $$ /  \\__|  $$ |   $$ /  $$ |  $$ |   $$ /  \\__|{_RESET}")
    log(f"{_PURPLE}\\$$$$$$\\  $$$$$$$  |$$$$$$$  |$$ |  $$ |$$ |      $$$$$  /  $$$$$\\       $$ |    \\$$$$$$\\    $$ |   $$$$$$$$ |  $$ |   \\$$$$$$\\  {_RESET}")
    log(f"{_PURPLE} \\____$$\\ $$  ____/ $$  __$$< $$ |  $$ |$$ |      $$  $$<   $$  __|      $$ |     \\____$$\\   $$ |   $$  __$$ |  $$ |    \\____$$\\ {_RESET}")
    log(f"{_PURPLE}$$\\   $$ |$$ |      $$ |  $$ |$$ |  $$ |$$ |  $$\\ $$ |\\$$\\  $$ |         $$ |    $$\\   $$ |  $$ |   $$ |  $$ |  $$ |   $$\\   $$ |{_RESET}")
    log(f"{_PURPLE}\\$$$$$$  |$$ |      $$ |  $$ | $$$$$$  |\\$$$$$$  |$$ | \\$$\\ $$$$$$$$\\    $$ |    \\$$$$$$  |  $$ |   $$ |  $$ |  $$ |   \\$$$$$$  |{_RESET}")
    log(f"{_PURPLE} \\______/ \\__|      \\__|  \\__| \\______/  \\______/ \\__|  \\__|\\________|   \\__|     \\______/   \\__|   \\__|  \\__|  \\__|    \\______/ {_RESET}")


# ============================================================================
# DATA OPERATIONS
# ============================================================================

async def download_data(event_key):
    """Download scouting data from the database."""
    global downloaded_data

    log_header("DOWNLOAD DATA")

    try:
        log_step("Connecting to database...")
        conn = await get_connection()
        log_success("Database connected")

        event_name = event_key or "all events"
        log_step(f"Fetching data from {_CYAN}{event_name}{_RESET}")
        event_filter = f"%{event_key}%" if event_key else None

        # -- Match scouting -------------------------------------------------
        log_step("Fetching match scouting...")
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
        log_stat("Robot entries", robot_entries)
        log_stat("Unique matches", match_count)

        # -- Pit scouting --------------------------------------------------
        log_step("Fetching pit scouting...")
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
        log_stat("Pit entries", len(pit))

        # -- Match schedules -----------------------------------------------
        log_step("Fetching match schedules...")
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
        log_stat("Schedule entries", len(all_matches))

        # -- Store & return ------------------------------------------------
        downloaded_data = {
            "match_scouting": match,
            "pit_scouting": pit,
            "all_matches": all_matches,
        }

        total_records = robot_entries + len(pit) + len(all_matches)
        await conn.close()

        log_done(f"{_YELLOW}{total_records}{_RESET} total records")
        return {"success": True, "records": total_records}

    except Exception as e:
        log_error(str(e))
        return {"success": False, "error": str(e)}


async def upload_data(event_key):
    """Upload calculation results to the database."""
    log_header("UPLOAD DATA")

    if not calc_result or "result" not in calc_result:
        log_error("No calculator output found -- run calculation first")
        return {"success": False, "error": "No calculation results"}

    try:
        log_step("Connecting to database...")
        conn = await get_connection()
        log_success("Database connected")

        if not event_key:
            log_error("Event key is required for upload")
            return {"success": False, "error": "Event key required"}

        log_step(f"Uploading to {_CYAN}{event_key}{_RESET}...")

        await conn.execute(
            "INSERT INTO processed_data (event_key, data) VALUES ($1, $2)",
            event_key,
            json.dumps(calc_result["result"]),
        )

        result = calc_result["result"]
        record_count = len(result) if isinstance(result, (list, dict)) else 1
        log_stat("Records uploaded", record_count)

        await conn.close()

        log_done(f"{_YELLOW}{record_count}{_RESET} records uploaded to {_CYAN}{event_key}{_RESET}")
        return {"success": True, "records": record_count}

    except Exception as e:
        log_error(str(e))
        return {"success": False, "error": str(e)}


# ============================================================================
# CALCULATION ENGINE
# ============================================================================

def run_calculation(setting):
    """Execute scouting data calculations."""
    global calc_result, downloaded_data

    log_header("CALCULATION")

    try:
        setting = json.loads(setting) if isinstance(setting, str) else setting

        if not setting.get("event_key"):
            log_error("Event key is required")
            return {"success": False, "error": "Event key required"}

        event_key = setting["event_key"]
        stop_on_warning = setting.get("stop_on_warning", False)

        log_step(f"Running calculations for {_CYAN}{event_key}{_RESET}")
        if stop_on_warning:
            log_substep(f"Stop on warning: {_YELLOW}enabled{_RESET}")

        # -- Validate local data -------------------------------------------
        log_step("Validating downloaded data...")
        if not validate_downloaded_data(event_key, stop_on_warning):
            log_error("Data validation failed")
            return {"success": False, "error": "Data validation failed"}
        log_success("Data validated")

        # -- Statbotics ----------------------------------------------------
        log_step("Fetching Statbotics data...")
        try:
            sb_data = sb.get_matches(event=event_key)
            sb_count = len(sb_data) if isinstance(sb_data, (list, dict)) else 0

            if sb_count == 0:
                log_warn("No Statbotics data returned")
                if stop_on_warning:
                    return {"success": False, "error": "No Statbotics data"}
            else:
                log_stat("Statbotics entries", sb_count)
        except UserWarning as e:
            log_warn(f"Statbotics error: {e}")
            if stop_on_warning:
                return {"success": False, "error": f"Statbotics error: {e}"}
            sb_data = {}

        # -- TBA -----------------------------------------------------------
        log_step("Fetching TBA data...")
        tba_response = requests.get(
            f"https://www.thebluealliance.com/api/v3/event/{event_key}/matches",
            headers={"X-TBA-Auth-Key": TBA_API_KEY}
        )

        if tba_response.status_code != 200:
            log_error(f"TBA request failed (status {tba_response.status_code})")
            if stop_on_warning:
                return {"success": False, "error": "TBA request failed"}
            tba_data = []
        else:
            tba_data = tba_response.json()
            if not tba_data:
                log_warn("No TBA matches returned")
                if stop_on_warning:
                    return {"success": False, "error": "No TBA data"}
            else:
                log_stat("TBA matches", len(tba_data))

        # -- Initialize result structure -----------------------------------
        log_step("Initializing calculation results...")
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
            log_error("Structure initialization failed")
            return {"success": False, "error": "Structure initialization failed"}

        log_warn("No calculations yet")
        log_done()
        return {"success": True}

    except Exception as e:
        log_error(str(e))
        return {"success": False, "error": str(e)}


def validate_downloaded_data(event_key, stop_on_warning=False):
    """Validate that downloaded_data contains necessary information."""
    global downloaded_data

    if not downloaded_data:
        log_error("No data downloaded -- run download_data() first")
        return False

    required_keys = ["match_scouting", "pit_scouting", "all_matches"]
    missing_keys = [k for k in required_keys if k not in downloaded_data]

    if missing_keys:
        log_error(f"Missing data keys: {', '.join(missing_keys)}")
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

    log_stat("Match scouting entries", len(match_scouting), indent=6)
    log_stat("Pit scouting entries", len(pit_scouting), indent=6)
    log_stat("Match schedules", len(all_matches), indent=6)

    if len(match_scouting) == 0:
        log_warn("No match scouting data for this event")
        if stop_on_warning:
            return False

    if len(all_matches) == 0:
        log_warn("No match schedules for this event")
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

    log_step("Initializing teams and matches from TBA...")

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

    log_stat("Matches initialized", len(calc_result["match"]))
    log_stat("Teams initialized", len(calc_result["team"]))

    sb_match_keys = set(sb_matches.keys())
    missing_in_sb = tba_match_keys - sb_match_keys
    extra_in_sb = sb_match_keys - tba_match_keys

    if missing_in_sb:
        log_warn(f"{len(missing_in_sb)} TBA matches missing in Statbotics")
        if stop_on_warning:
            return False

    if extra_in_sb:
        log_warn(f"{len(extra_in_sb)} Statbotics matches not in TBA")
        if stop_on_warning:
            return False

    log_step("Validating against downloaded data...")

    match_scouting = [
        m for m in downloaded_data.get("match_scouting", [])
        if m.get("event_key") == event_key
    ]

    most_recent = determine_most_recent_match(match_scouting, calc_result)
    if most_recent:
        calc_result["most_recent_match"] = most_recent
        log_substep(f"Most recent match (>3 submissions): {_GREEN}{most_recent}{_RESET}")
    else:
        log_substep(f"No match with >3 submissions found")

    log_success("Structure initialization complete")
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
    functions, classes, variables = [], [], []

    for name, obj in globals().items():
        if name.startswith('_') or isinstance(obj, types.ModuleType):
            continue

        if isinstance(obj, types.FunctionType):
            functions.append(name)
        elif isinstance(obj, type):
            classes.append(name)
        else:
            variables.append(name)

    log(f"\n{_CYAN}Functions:{_RESET}")
    for f in sorted(functions):
        log(f"  {_DIM}-{_RESET} {f}")

    log(f"{_YELLOW}Classes:{_RESET}")
    for c in sorted(classes):
        log(f"  {_DIM}-{_RESET} {c}")

    log(f"{_GREEN}Variables:{_RESET}")
    for v in sorted(variables):
        log(f"  {_DIM}-{_RESET} {v}")

    log("")


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
        REPL_GLOBALS["print"] = log  # redirect print -> log

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
