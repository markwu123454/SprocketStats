"""
Database Manager for Scouting Application
==========================================

This module provides database connectivity, data download/upload functionality,
and calculation processing for FRC scouting data stored in PostgreSQL.

Key Components:
    - Database connection management with SSL
    - Data download from multiple scouting tables
    - Data upload to processed_data table
    - Custom logging and stdout redirection for C# integration
    - Database schema validation
    - Async operation support

Global State:
    - downloaded_data: Cache of downloaded scouting data
    - calc_result: Storage for calculation results
    - DATABASE_KEY: PostgreSQL connection string
    - DATABASE_SCHEMA: Expected database schema definition
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

_log = None  # Callback function for logging to C# host
_set_busy_cb = None  # Callback function to signal busy state to C# host

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

# ============================================================================
# LOGGING & OUTPUT REDIRECTION
# ============================================================================
# Custom stdout/stderr handling for C# interop
# Note: Use \x1B[A\x1B[K to delete previous line and overwrite it

class _CSharpStdout:
    """
    Custom stdout/stderr replacement that redirects output to C# logger.
    
    Filters out empty lines and strips trailing whitespace before logging.
    Required to integrate Python console output with C# application.
    """

    def write(self, text):
        if _log and text.strip():
            _log(text.rstrip())

    def flush(self):
        pass  # Required by file-like interface


def register_logger(cb):
    """
    Register a callback function for logging and redirect stdout/stderr.
    
    Args:
        cb: Callback function that accepts a string message
        
    Side effects:
        - Sets global _log callback
        - Redirects sys.stdout to _CSharpStdout
        - Redirects sys.stderr to _CSharpStdout
    """
    global _log
    _log = cb

    # Redirect stdout and stderr to C# logger
    sys.stdout = _CSharpStdout()
    sys.stderr = _CSharpStdout()


def log(msg: str):
    """
    Log a message using the registered logger callback.
    
    Args:
        msg: Message to log
    """
    if _log:
        _log(msg)


def register_set_busy(cb):
    """
    Register a callback to signal busy/idle state to C# host.
    
    Args:
        cb: Callback function that accepts a boolean (True = busy, False = idle)
    """
    global _set_busy_cb
    _set_busy_cb = cb


def set_busy(value: bool):
    """
    Signal busy/idle state to C# host application.
    
    Args:
        value: True if operation is in progress, False if complete
    """
    if _set_busy_cb:
        _set_busy_cb(value)


# ============================================================================
# DATABASE CONNECTION
# ============================================================================

async def get_connection():
    """
    Create and configure a PostgreSQL database connection.
    
    Returns:
        asyncpg.Connection: Configured database connection with SSL and JSON codecs
        
    Raises:
        RuntimeError: If DATABASE_KEY is not set
        
    Notes:
        - Uses SSL with certifi CA bundle
        - Configures JSON/JSONB codecs for automatic serialization
    """
    if not DATABASE_KEY:
        raise RuntimeError("DATABASE_URL not set in environment")

    # Create SSL context with certifi CA bundle for secure connections
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    # Establish connection
    conn = await asyncpg.connect(dsn=DATABASE_KEY, ssl=ssl_context)

    # Configure automatic JSON encoding/decoding for JSONB columns
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
    
    Checks:
        - DATABASE_KEY is set
        - DATABASE_SCHEMA is defined
        - Database connection can be established
        - All required tables exist
        - All required columns exist in each table
    
    Returns:
        tuple: (ok: bool, errors: list[str])
            - ok: True if all checks pass, False otherwise
            - errors: List of error messages (empty if ok=True)
    """
    global DATABASE_KEY, DATABASE_SCHEMA

    errors: list[str] = []

    # Validate configuration
    if not DATABASE_KEY:
        return False, ["DATABASE_KEY is not set"]

    if not isinstance(DATABASE_SCHEMA, dict) or not DATABASE_SCHEMA:
        return False, ["DATABASE_SCHEMA is not defined or empty"]

    conn = None
    try:
        # Establish connection with SSL
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        conn = await asyncpg.connect(dsn=DATABASE_KEY, ssl=ssl_context)

        # Fetch all tables in the public schema
        rows = await conn.fetch("""
                                SELECT table_name
                                FROM information_schema.tables
                                WHERE table_schema = 'public';
                                """)
        existing_tables = {r["table_name"] for r in rows}

        # Check for missing tables
        for table in DATABASE_SCHEMA:
            if table not in existing_tables:
                errors.append(f"Missing table: {table}")

        # Check for missing columns in each table
        for table, required_cols in DATABASE_SCHEMA.items():
            if table not in existing_tables:
                continue  # Skip column check if table doesn't exist

            # Fetch columns for this table
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
    """
    Initialize the Python environment and validate database connectivity.
    
    Steps:
        1. Load environment variables from .env file
        2. Retrieve DATABASE_KEY and TBA_API_KEY
        3. Check FRC score tracker dependencies
        4. Validate database connection and schema
        5. Display startup banner
        6. Report any errors
    
    Side effects:
        - Sets global DATABASE_KEY and TBA_API_KEY
        - Prints startup banner and status messages
        - Loads .env file into environment
    """
    global DATABASE_KEY, TBA_API_KEY, FRCScoreTracker, ScoreRegionConfig

    has_errored = False
    got_db_key = False
    errors = []
    warnings = []

    print("Loading... Checking environment")

    # Load environment variables
    try:
        env_path = dotenv.find_dotenv()
        dotenv.load_dotenv(env_path, override=True)
        DATABASE_KEY = os.getenv("DATABASE_KEY")
        TBA_API_KEY = os.getenv("TBA_API_KEY")

        if not DATABASE_KEY:
            errors.append(
                "DATABASE_KEY is missing. Run 'DATABASE_KEY=\"...\"' then 'verify_db()' in the console or add DATABASE_KEY to your .env file."
            )
            has_errored = True
        elif not TBA_API_KEY:
            errors.append(
                "TBA_API_KEY is missing. Go to https://www.thebluealliance.com/account and get one."
            )
            has_errored = True
        else:
            got_db_key = True
    except Exception as e:
        errors.append(str(e))
        has_errored = True

    print("Loading... Checking FRC score tracker dependencies")

    # Check Python packages for FRC score tracker
    missing_packages = []
    try:
        import cv2
    except ImportError:
        missing_packages.append("opencv-python")

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
        errors.append(
            f"Missing Python packages for FRC score tracker: {', '.join(missing_packages)}"
        )
        errors.append(f"Install with: pip install {' '.join(missing_packages)}")
        has_errored = True

    # Check Tesseract OCR installation
    tesseract_ok = False
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        tesseract_ok = True
    except ImportError:
        pass  # Already caught above
    except Exception as e:
        errors.append(
            "Tesseract OCR not installed or not in PATH"
        )
        errors.append(
            "Install: Ubuntu/Debian: 'sudo apt install tesseract-ocr' | "
            "macOS: 'brew install tesseract' | "
            "Windows: https://github.com/UB-Mannheim/tesseract/wiki"
        )
        has_errored = True

    # Check GPU acceleration availability (optional, non-critical)
    try:
        import cv2
        gpu_available = False
        gpu_type = None

        # Check OpenCL (AMD/Intel)
        if cv2.ocl.haveOpenCL():
            cv2.ocl.setUseOpenCL(True)
            if cv2.ocl.useOpenCL():
                gpu_available = True
                gpu_type = "OpenCL (AMD/Intel)"

        # Check CUDA (NVIDIA)
        if not gpu_available:
            try:
                if cv2.cuda.getCudaEnabledDeviceCount() > 0:
                    gpu_available = True
                    gpu_type = "CUDA (NVIDIA)"
            except:
                pass

        if gpu_available:
            warnings.append(f"✓ GPU acceleration available: {gpu_type}")
        else:
            warnings.append(
                "⚠ No GPU acceleration detected (will use CPU-only mode)"
            )
            warnings.append(
                "  For AMD GPU: Install 'sudo apt install rocm-opencl-dev ocl-icd-opencl-dev'"
            )
    except ImportError:
        pass  # opencv-python not installed, already caught above

    # Check yt-dlp availability (optional for YouTube streams)
    try:
        import subprocess
        result = subprocess.run(
            ['yt-dlp', '--version'],
            capture_output=True,
            timeout=2
        )
        if result.returncode == 0:
            warnings.append("✓ yt-dlp available for YouTube stream processing")
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        warnings.append(
            "⚠ yt-dlp not found in PATH (needed for YouTube streams)"
        )
        warnings.append(
            "  Install: pip install yt-dlp (or system package)"
        )

    print("Loading... Checking database")

    # Validate database connection and schema
    try:
        if got_db_key:
            ok, db_errors = asyncio.run(verify_db())
            if not ok:
                errors.extend(db_errors)
                has_errored = True
        else:
            errors.append("Database validation skipped due to missing DATABASE_KEY.")
            has_errored = True
    except Exception as e:
        errors.append(f"verify_db failed: {e}")
        has_errored = True

    print("Done.")
    time.sleep(1)

    # Clear screen below cursor
    print("\x1b[J")

    # Display ASCII art banner
    _print_banner()

    # Report status
    if not has_errored:
        print("\x1b[32mInitialization complete.\x1b[0m\n")

        # Show warnings (non-critical)
        if warnings:
            print("\x1b[36mEnvironment Notes:\x1b[0m")
            for warn in warnings:
                print(f"  {warn}")
            print()

        print("Use list_globals() to see all available helpers and variables")
        from frc_score_tracker_lib import FRCScoreTracker as _Tracker, ScoreRegionConfig as _Config
        FRCScoreTracker = _Tracker
        ScoreRegionConfig = _Config
    else:
        # Show errors first
        for err in errors:
            print(f"\x1b[31m{err}\x1b[0m")

        # Then warnings
        if warnings:
            print()
            for warn in warnings:
                print(f"\x1b[33m{warn}\x1b[0m")

        print("\x1b[33mInitialization complete with errors.\x1b[0m\n")


def _print_banner():
    """Print the application startup banner with ANSI colors."""
    print("\x1b[35m $$$$$$\  $$$$$$$\  $$$$$$$\   $$$$$$\   $$$$$$\  $$\   $$\ $$$$$$$$\ $$$$$$$$\   $$$$$$\ $$$$$$$$\  $$$$$$\ $$$$$$$$\  $$$$$$\  \x1b[0m")
    print("\x1b[35m$$  __$$\ $$  __$$\ $$  __$$\ $$  __$$\ $$  __$$\ $$ | $$  |$$  _____|\__$$  __| $$  __$$\\\__$$  __|$$  __$$\\\__$$  __|$$  __$$\ \x1b[0m")
    print("\x1b[35m$$ /  \__|$$ |  $$ |$$ |  $$ |$$ /  $$ |$$ /  \__|$$ |$$  / $$ |         $$ |    $$ /  \__|  $$ |   $$ /  $$ |  $$ |   $$ /  \__|\x1b[0m")
    print("\x1b[35m\$$$$$$\  $$$$$$$  |$$$$$$$  |$$ |  $$ |$$ |      $$$$$  /  $$$$$\       $$ |    \$$$$$$\    $$ |   $$$$$$$$ |  $$ |   \$$$$$$\  \x1b[0m")
    print("\x1b[35m \____$$\ $$  ____/ $$  __$$< $$ |  $$ |$$ |      $$  $$<   $$  __|      $$ |     \____$$\   $$ |   $$  __$$ |  $$ |    \____$$\ \x1b[0m")
    print("\x1b[35m$$\   $$ |$$ |      $$ |  $$ |$$ |  $$ |$$ |  $$\ $$ |\$$\  $$ |         $$ |    $$\   $$ |  $$ |   $$ |  $$ |  $$ |   $$\   $$ |\x1b[0m")
    print("\x1b[35m\$$$$$$  |$$ |      $$ |  $$ | $$$$$$  |\$$$$$$  |$$ | \$$\ $$$$$$$$\    $$ |    \$$$$$$  |  $$ |   $$ |  $$ |  $$ |   \$$$$$$  |\x1b[0m")
    print("\x1b[35m \______/ \__|      \__|  \__| \______/  \______/ \__|  \__|\________|   \__|     \______/   \__|   \__|  \__|  \__|    \______/\x1b[0m")


# ============================================================================
# DATA OPERATIONS
# ============================================================================

async def download_data(event_key):
    """
    Download scouting data from the database.
    
    Fetches three types of data:
        1. Match scouting - Robot performance data from matches
        2. Pit scouting - Pre-competition team information
        3. Match schedules - Match roster and timing information
    
    Args:
        event_key: Event identifier (e.g., "2024txhou"). 
                   If None or empty, downloads data from all events.
    
    Side effects:
        - Updates global downloaded_data dict
        - Prints progress messages
        - Sets busy state during operation
    
    Global state modified:
        downloaded_data: {
            "match_scouting": [...],
            "pit_scouting": [...],
            "all_matches": [...]
        }
    """
    global downloaded_data

    set_busy(True)
    print("\n=== START DOWNLOAD ===")

    try:
        # Establish database connection
        print("→ Connecting to database...")
        conn = await get_connection()
        print("→ Database connected")

        # Prepare event filter
        event_name = event_key or 'all events'
        print(f"→ Fetching data from \x1b[36m{event_name}\x1b[0m...")
        event_filter = f"%{event_key}%" if event_key else None

        # ────────────────────────────────────────────────────────────────
        # MATCH SCOUTING DATA
        # ────────────────────────────────────────────────────────────────
        print("→ Fetching match data...")
        match_query = """
                      SELECT event_key, match, match_type, team, alliance, scouter, data
                      FROM match_scouting
                      WHERE status = 'submitted' \
                      """

        if event_filter:
            match_query += " AND event_key ILIKE $1"
            rows = await conn.fetch(match_query, event_filter)
        else:
            match_query += " ORDER BY match_type, match, alliance, team"
            rows = await conn.fetch(match_query)

        match = [dict(r) for r in rows]

        # Calculate statistics
        robot_entries = len(match)
        match_count = len({
            (r["event_key"], r["match_type"], r["match"])
            for r in match
        })

        print(f"  \x1b[33m{robot_entries}\x1b[0m robot entries from "
              f"\x1b[33m{match_count}\x1b[0m matches")

        # ────────────────────────────────────────────────────────────────
        # PIT SCOUTING DATA
        # ────────────────────────────────────────────────────────────────
        print("→ Fetching team data...")
        pit_query = """
                    SELECT event_key, team, scouter, data
                    FROM pit_scouting
                    WHERE status = 'submitted' \
                    """

        if event_filter:
            pit_query += " AND event_key ILIKE $1"
            rows = await conn.fetch(pit_query, event_filter)
        else:
            pit_query += " ORDER BY team, scouter"
            rows = await conn.fetch(pit_query)

        pit = [dict(r) for r in rows]
        print(f"  \x1b[33m{len(pit)}\x1b[0m pit entries")

        # ────────────────────────────────────────────────────────────────
        # MATCH SCHEDULE DATA
        # ────────────────────────────────────────────────────────────────
        print("→ Fetching match schedules...")
        schedule_query = """
                         SELECT key, event_key, match_type, match_number, set_number,
                             scheduled_time, actual_time,
                             red1, red2, red3, blue1, blue2, blue3
                         FROM matches \
                         """

        if event_filter:
            schedule_query += " WHERE event_key ILIKE $1"
            rows = await conn.fetch(schedule_query, event_filter)
        else:
            schedule_query += " ORDER BY event_key, match_type, match_number"
            rows = await conn.fetch(schedule_query)

        all_matches = [dict(r) for r in rows]
        print(f"  \x1b[33m{len(all_matches)}\x1b[0m schedule entries")

        # ────────────────────────────────────────────────────────────────
        # STORE RESULTS
        # ────────────────────────────────────────────────────────────────
        downloaded_data = {
            "match_scouting": match,
            "pit_scouting": pit,
            "all_matches": all_matches,
        }

        total_records = robot_entries + len(pit) + len(all_matches)

        await conn.close()
        print(f"→ Done - \x1b[33m{total_records}\x1b[0m total records\n")

    except Exception as e:
        print(f"\x1b[31mError: {e}\x1b[0m")
    finally:
        set_busy(False)


async def upload_data(event_key):
    """
    Upload calculation results to the database.
    
    Takes the results from calc_result["result"] and stores them in the
    processed_data table for the specified event.
    
    Args:
        event_key: Event identifier (required, cannot be None)
    
    Requirements:
        - calc_result must be populated (run run_calculation first)
        - event_key must be provided
    
    Side effects:
        - Inserts record into processed_data table
        - Prints progress messages
        - Sets busy state during operation
    """
    set_busy(True)
    print("\n=== START UPLOAD ===")

    # Validate prerequisites
    if not calc_result or "result" not in calc_result:
        print("\x1b[31mError: No calculator output found. "
              "Run Calculator first.\x1b[0m")
        set_busy(False)
        return

    try:
        # Establish database connection
        print("→ Connecting to database...")
        conn = await get_connection()
        print("→ Database connected")

        # Validate event key
        if not event_key:
            print("\x1b[31mError: Event key filter is required for upload.\x1b[0m")
            return

        print(f"→ Uploading to \x1b[36m{event_key}\x1b[0m...")

        # Insert processed data
        await conn.execute(
            "INSERT INTO processed_data (event_key, data) VALUES ($1, $2)",
            event_key,
            json.dumps(calc_result["result"]),
        )

        # Calculate record count for logging
        result = calc_result["result"]
        record_count = (
            len(result) if isinstance(result, (list, dict)) else 1
        )
        print(f"  \x1b[33m{record_count}\x1b[0m records uploaded")

        await conn.close()
        print("→ Done\n")

    except Exception as e:
        print(f"\x1b[31mError: {e}\x1b[0m")
    finally:
        set_busy(False)


# ============================================================================
# CALCULATION ENGINE
# ============================================================================
# TODO: This function will grow significantly. Consider breaking it into:
#   - Separate calculation modules (e.g., opr.py, rankings.py, predictions.py)
#   - A calculation registry/dispatcher pattern
#   - Helper functions for common transformations
def run_calculation(setting):
    """
    Execute scouting data calculations.
    
    This function will grow to include complex analysis such as:
        - OPR (Offensive Power Rating) calculations
        - Team rankings and predictions
        - Match outcome predictions
        - Statistical aggregations
        - Performance trending
    
    Args:
        setting: JSON string containing configuration with:
            - event_key: Event identifier (required)
            - stop_on_warning: If True, halt on data fetch failures
    
    Returns:
        str: Status message describing the calculation result
    
    Side effects:
        - Updates global calc_result
        - May take significant time for large datasets
    
    TODO: Break this into modular calculation functions as it grows:
        - calculate_opr()
        - calculate_team_rankings()
        - predict_match_outcomes()
        - aggregate_statistics()
        - etc.
    """
    global calc_result, downloaded_data

    set_busy(True)
    print("\n=== START CALCULATION ===")
    print("Output data is found in calc_result, keys include team, match, ranking, alliance, sb, tba, match_index, match_reverse_index")

    try:
        setting = json.loads(setting)

        # Validate event key
        if not setting["event_key"]:
            print("\x1b[31mError: Event key is required\x1b[0m")
            set_busy(False)
            return

        event_key = setting["event_key"]
        stop_on_warning = setting.get("stop_on_warning", False)

        print(f"→ Running calculations for \x1b[36m{event_key}\x1b[0m...")
        if stop_on_warning:
            print("   (stop on warning: \x1b[33menabled\x1b[0m)")

        # --- Validate downloaded data exists ---
        print("→ Validating downloaded data...")
        if not validate_downloaded_data(event_key, stop_on_warning):
            return

        # --- Fetch Statbotics data ---
        print("→ Fetching Statbotics data...")
        try:
            sb_data = sb.get_matches(event=event_key)
            sb_count = len(sb_data) if isinstance(sb_data, (list, dict)) else 0

            if sb_count == 0:
                print("   \x1b[31mWarning: No Statbotics data returned\x1b[0m")
                if stop_on_warning:
                    print("\x1b[31mStopping: stop_on_warning is enabled\x1b[0m")
                    set_busy(False)
                    return
            else:
                print(f"   \x1b[33m{sb_count}\x1b[0m Statbotics entries")

        except UserWarning as e:
            print(f"   \x1b[31mStatbotics error: {e}\x1b[0m")
            if stop_on_warning:
                print("\x1b[31mStopping: stop_on_warning is enabled\x1b[0m")
                set_busy(False)
                return
            sb_data = {}

        # --- Fetch TBA data ---
        print("→ Fetching TBA data...")
        tba_response = requests.get(
            f"https://www.thebluealliance.com/api/v3/event/{event_key}/matches",
            headers={"X-TBA-Auth-Key": TBA_API_KEY}
        )

        if tba_response.status_code != 200:
            print(f"   \x1b[31mTBA request failed (status {tba_response.status_code})\x1b[0m")
            if stop_on_warning:
                print("\x1b[31mStopping: stop_on_warning is enabled\x1b[0m")
                return
            tba_data = []
        else:
            tba_data = tba_response.json()
            if not tba_data:
                print("   \x1b[31mWarning: No TBA matches returned\x1b[0m")
                if stop_on_warning:
                    print("\x1b[31mStopping: stop_on_warning is enabled\x1b[0m")
                    return
            else:
                print(f"   \x1b[33m{len(tba_data)}\x1b[0m TBA matches")

        # --- Initialize calculation result ---
        print("→ Initializing calculation results...")
        calc_result.clear()
        calc_result["ranking"] = {}
        calc_result["alliance"] = {}

        # Process TBA data to populate variables
        all_match = [{"key": m["key"]} for m in tba_data]
        print(all_match)

        teams = set()
        for m in tba_data:
            if "alliances" in m:
                for alliance in ["red", "blue"]:
                    if alliance in m["alliances"]:
                        teams.update(m["alliances"][alliance].get("team_keys", []))
        all_team = sorted(list(teams))

        # Determine current match (first unplayed match, or last match if all played)
        # Sort matches by time/order first to be safe (though TBA usually returns them sorted)
        # Using lambda to handle potential None values in time
        sorted_matches = sorted(tba_data, key=lambda m: m.get("predicted_time") or m.get("time") or 0)

        current_match = ""
        for m in sorted_matches:
            if m.get("actual_time") is None:
                current_match = m["key"]
                break

        if not current_match and all_match:
            current_match = all_match[-1]

        print(f"   Matches: {len(all_match)} found (e.g., {all_match[:3]})")
        print(f"   Teams: {len(all_team)} found")
        print(f"   Current Match: {current_match}")

        calc_result["sb"] = sb_data
        calc_result["tba"] = tba_data

        # --- Initialize teams & matches (authoritative: TBA) ---
        if not initialize_structure(
                calc_result=calc_result,
                tba_data=tba_data,
                sb_data=sb_data,
                downloaded_data=downloaded_data,
                event_key=event_key,
                stop_on_warning=stop_on_warning
        ):
            return

        print("\x1b[33mNo calculations yet.\x1b[0m")
        print("→ Done\n")

    except Exception as e:
        print(f"\x1b[31mError: {e}\x1b[0m")

    finally:
        set_busy(False)


def validate_downloaded_data(event_key, stop_on_warning=False):
    """
    Validate that downloaded_data contains necessary information for calculations.

    Args:
        event_key: Event identifier to validate
        stop_on_warning: If True, return False on any warning

    Returns:
        bool: True if validation passes, False otherwise
    """
    global downloaded_data

    if not downloaded_data:
        print("   \x1b[31mError: No data downloaded. Run download_data() first.\x1b[0m")
        return False

    # Check required keys
    required_keys = ["match_scouting", "pit_scouting", "all_matches"]
    missing_keys = [k for k in required_keys if k not in downloaded_data]

    if missing_keys:
        print(f"   \x1b[31mError: Missing data keys: {', '.join(missing_keys)}\x1b[0m")
        return False

    # Filter data for this event
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

    # Report counts
    print(f"   Match scouting entries: \x1b[33m{len(match_scouting)}\x1b[0m")
    print(f"   Pit scouting entries: \x1b[33m{len(pit_scouting)}\x1b[0m")
    print(f"   Match schedules: \x1b[33m{len(all_matches)}\x1b[0m")

    # Warnings
    if len(match_scouting) == 0:
        print("   \x1b[31mWarning: No match scouting data for this event\x1b[0m")
        if stop_on_warning:
            return False

    if len(all_matches) == 0:
        print("   \x1b[31mWarning: No match schedules for this event\x1b[0m")
        if stop_on_warning:
            return False

    return True


def initialize_structure(calc_result, tba_data, sb_data, downloaded_data, event_key, stop_on_warning=False):
    """
    Initialize empty calculation structures for teams and matches.

    - Teams are stored as integers (e.g. 9408)
    - Matches are normalized to qm1, qm2, ..., sf1, ..., f1, ...
    - TBA is authoritative for structure
    - Statbotics is sanity-checked against raw TBA keys
    - Downloaded data is validated for consistency
    """

    # --- Normalize Statbotics data into dict keyed by raw TBA match key ---
    sb_matches = {}
    if isinstance(sb_data, dict):
        sb_matches = sb_data
    elif isinstance(sb_data, list):
        for m in sb_data:
            if "key" in m:
                sb_matches[m["key"]] = m

    # --- Containers ---
    calc_result["team"] = {}
    calc_result["match"] = {}
    calc_result["match_index"] = {}          # canonical -> tba_key
    calc_result["match_reverse_index"] = {}  # tba_key -> canonical

    print("→ Initializing teams and matches from TBA...")

    # --- Collect raw TBA match keys for sanity check ---
    tba_match_keys = {m["key"] for m in tba_data if "key" in m}

    # --- Group matches by comp level ---
    grouped = {"qm": [], "sf": [], "f": []}

    for match in tba_data:
        level = match.get("comp_level")
        if level in grouped:
            grouped[level].append(match)

        # --- Initialize teams (numeric keys) ---
        alliances = match.get("alliances", {})
        for color in ("red", "blue"):
            for raw_team_key in alliances.get(color, {}).get("team_keys", []):
                team_num = parse_team_key(raw_team_key)
                calc_result["team"].setdefault(team_num, {})

    # --- Normalize matches to qm1, sf1, f1 ---
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

    print(f"   Initialized {len(calc_result['match'])} matches")
    print(f"   Initialized {len(calc_result['team'])} teams")

    # --- Sanity checks against Statbotics (raw keys only) ---
    sb_match_keys = set(sb_matches.keys())

    missing_in_sb = tba_match_keys - sb_match_keys
    extra_in_sb = sb_match_keys - tba_match_keys

    if missing_in_sb:
        print(f"\x1b[31mWarning: {len(missing_in_sb)} TBA matches missing in Statbotics\x1b[0m")
        if stop_on_warning:
            print("\x1b[31mStopping: stop_on_warning is enabled\x1b[0m")
            return False

    if extra_in_sb:
        print(f"\x1b[31mWarning: {len(extra_in_sb)} Statbotics matches not present in TBA\x1b[0m")
        if stop_on_warning:
            print("\x1b[31mStopping: stop_on_warning is enabled\x1b[0m")
            return False

    # --- Validate against downloaded data ---
    print("→ Validating against downloaded data...")

    # Filter downloaded data for this event
    match_scouting = [
        m for m in downloaded_data.get("match_scouting", [])
        if m.get("event_key") == event_key
    ]
    pit_scouting = [
        p for p in downloaded_data.get("pit_scouting", [])
        if p.get("event_key") == event_key
    ]

    # Extract teams from scouted data
    scouted_teams = set()
    for entry in match_scouting:
        if "team" in entry:
            try:
                scouted_teams.add(parse_team_key(entry["team"]))
            except ValueError:
                pass

    for entry in pit_scouting:
        if "team" in entry:
            try:
                scouted_teams.add(parse_team_key(entry["team"]))
            except ValueError:
                pass

    # Compare with TBA teams
    tba_teams = set(calc_result["team"].keys())

    teams_not_scouted = tba_teams - scouted_teams
    teams_scouted_not_in_tba = scouted_teams - tba_teams

    if teams_not_scouted:
        print(f"   \x1b[33mInfo: {len(teams_not_scouted)} teams in TBA not yet scouted\x1b[0m")

    if teams_scouted_not_in_tba:
        print(f"   \x1b[31mWarning: {len(teams_scouted_not_in_tba)} scouted teams not in TBA roster\x1b[0m")
        if stop_on_warning:
            print("\x1b[31mStopping: stop_on_warning is enabled\x1b[0m")
            return False

    # --- Determine most recent match ---
    most_recent = determine_most_recent_match(match_scouting, calc_result)
    if most_recent:
        calc_result["most_recent_match"] = most_recent
        print(f"   Most recent match (>3 submissions): \x1b[32m{most_recent}\x1b[0m")
    else:
        print("   \x1b[33mNo match with >3 submissions found\x1b[0m")

    print("→ Structure initialization complete\n")
    return True


def determine_most_recent_match(match_scouting, calc_result):
    """
    Determine the most recent match based on having more than 3 match scouting submissions.

    Args:
        match_scouting: List of match scouting entries
        calc_result: Calculation result dict with match_reverse_index

    Returns:
        str: Canonical match key (e.g., "qm15") or None if no match qualifies
    """
    # Count submissions per match
    submission_counts = {}

    for entry in match_scouting:
        match_type = entry.get("match_type", "")
        match_num = entry.get("match", 0)

        # Construct match identifier
        match_id = f"{match_type}{match_num}"
        submission_counts[match_id] = submission_counts.get(match_id, 0) + 1

    # Find matches with >3 submissions and get their canonical keys
    qualifying_matches = []

    for match_id, count in submission_counts.items():
        if count > 3:
            # Try to find canonical key from reverse index
            # First, try to find matching TBA key
            tba_key = None
            for tba_k, canon_k in calc_result.get("match_reverse_index", {}).items():
                # TBA keys look like "2024txhou_qm1"
                if tba_k.endswith(f"_{match_id}"):
                    tba_key = tba_k
                    break

            if tba_key:
                canon_key = calc_result["match_reverse_index"][tba_key]
                qualifying_matches.append((canon_key, count))

    if not qualifying_matches:
        return None

    # Sort by canonical key to get most recent
    # Assuming qm comes before sf comes before f, and numbers are sequential
    def match_sort_key(item):
        canon_key = item[0]
        if canon_key.startswith("f"):
            level = 2
        elif canon_key.startswith("sf"):
            level = 1
        else:  # qm
            level = 0

        # Extract number
        num = int(''.join(filter(str.isdigit, canon_key)))
        return (level, num)

    qualifying_matches.sort(key=match_sort_key, reverse=True)

    return qualifying_matches[0][0]


def normalize_matches(tba_data):
    """
    Normalize TBA matches into canonical sequential IDs:
    qm1, qm2, ..., sf1, sf2, ..., f1, f2, ...

    Returns:
        dict: {
            canonical_key: {
                "tba_key": original_tba_key,
                "comp_level": "qm" | "sf" | "f"
            }
        }
    """

    level_order = {"qm": 0, "sf": 1, "f": 2}

    # Group matches by comp level
    grouped = {"qm": [], "sf": [], "f": []}

    for m in tba_data:
        level = m.get("comp_level")
        if level in grouped:
            grouped[level].append(m)

    normalized = {}

    for level in ("qm", "sf", "f"):
        matches = sorted(
            grouped[level],
            key=lambda m: (m.get("set_number", 0), m.get("match_number", 0))
        )

        for idx, match in enumerate(matches, start=1):
            canon_key = f"{level}{idx}"
            normalized[canon_key] = {
                "tba_key": match["key"],
                "comp_level": level,
                "set_number": match.get("set_number"),
                "match_number": match.get("match_number"),
            }

    return normalized


def parse_team_key(team_key):
    """
    Convert a TBA or Statbotics team key into an integer team number.
    """
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

def run_async(function):
    """
    Execute an async function synchronously.
    
    Convenience wrapper for running async functions from synchronous contexts.
    
    Args:
        function: Async function (coroutine) to execute
        
    Side effects:
        - Prints "Done" when complete
    """
    asyncio.run(function())
    print("Done")


def exec_command(code: str):
    """
    Execute arbitrary Python code with full access to module globals.
    
    Provides a REPL-like interface for debugging and interactive use.
    Exceptions are caught and displayed with ANSI color formatting.
    
    Args:
        code: Python code string to execute
        
    Side effects:
        - Executes code in global scope (state persists across calls)
        - Prints red-colored tracebacks on exceptions
        - Calls set_busy(False) on errors
        
    Security Note:
        This function executes arbitrary code. Only use in trusted environments.
    """
    try:
        try:
            # Try evaluating as an expression
            result = eval(code, globals(), globals())
        except SyntaxError:
            # Not an expression → execute as statements
            exec(code, globals(), globals())
        else:
            # Expression evaluated successfully
            if result is not None:
                print(result)
    except Exception as e:
        try:
            # Print red-colored traceback
            print(f"\x1b[31m{traceback.format_exc()}\x1b[0m")
        except Exception:
            # Fallback if traceback formatting fails
            print(f"\x1b[31mUnhandled error: {e}\x1b[0m")
        set_busy(False)


def list_globals():
    """
    List all functions and variables in the global scope.
    
    Categorizes globals into:
        - Functions
        - Classes
        - Variables (other objects)
    
    Excludes:
        - Built-in names (starting with '__')
        - Imported modules
    """

    functions = []
    classes = []
    variables = []

    for name, obj in globals().items():
        # Skip built-ins and private names
        if name.startswith('_'):
            continue

        # Skip imported modules
        if isinstance(obj, types.ModuleType):
            continue

        # Categorize
        if isinstance(obj, types.FunctionType):
            functions.append(name)
        elif isinstance(obj, type):
            classes.append(name)
        else:
            variables.append(name)

    # Print categorized results
    if functions:
        print("\n\x1b[36mFunctions:\x1b[0m")
        for name in sorted(functions):
            print(f"  {name}")

    if classes:
        print("\n\x1b[35mClasses:\x1b[0m")
        for name in sorted(classes):
            print(f"  {name}")

    if variables:
        print("\n\x1b[33mVariables:\x1b[0m")
        for name in sorted(variables):
            obj = globals()[name]
            type_name = type(obj).__name__
            print(f"  {name} ({type_name})")
    print("\n")