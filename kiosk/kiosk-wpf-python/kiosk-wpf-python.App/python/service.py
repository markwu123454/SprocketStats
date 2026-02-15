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
import statistics

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
# LOGGING SYSTEM
# ============================================================================

# Configure stderr to be unbuffered for real-time logging
sys.stderr.reconfigure(line_buffering=True)


class Logger:
    """
    Hierarchical logger with ANSI formatting and indentation support.

    Features:
    - Automatic indentation tracking
    - Context managers for nested sections
    - Semantic log levels (header, step, substep, success, warn, error)
    - Statistics and key-value logging
    """

    # ANSI codes
    RESET   = "\x1b[0m"
    BOLD    = "\x1b[1m"
    DIM     = "\x1b[38;5;245m"
    RED     = "\x1b[1;31m"
    GREEN   = "\x1b[1;32m"
    YELLOW  = "\x1b[1;33m"
    BLUE    = "\x1b[1;34m"
    MAGENTA = "\x1b[1;35m"
    PURPLE  = "\x1b[38;2;145;92;201m"
    CYAN    = "\x1b[1;36m"
    WHITE   = "\x1b[1;37m"

    BAR = "=" * 44

    def __init__(self):
        self.indent_level = 0
        self.indent_size = 2

    def _write(self, text, end="\n"):
        """Write to stderr with current indentation."""
        indent = " " * (self.indent_level * self.indent_size)
        sys.stderr.write(indent + text + end)
        sys.stderr.flush()

    def raw(self, *args, sep=" ", end="\n"):
        """Print-like interface without indentation."""
        text = sep.join(map(str, args))
        if text or end.strip():
            sys.stderr.write(text + end)
            sys.stderr.flush()

    def header(self, title):
        """Print a prominent section header."""
        self.raw(f"\n{self.PURPLE}{self.BAR}")
        self.raw(f"  {title}")
        self.raw(f"{self.PURPLE}{self.BAR}{self.RESET}")
        self.indent_level = 0

    def step(self, msg):
        """Print a top-level action step."""
        self._write(f"{self.BLUE}>{self.RESET} {msg}")

    def substep(self, msg):
        """Print an indented sub-detail."""
        self._write(f"{self.DIM}|_{self.RESET} {msg}")

    def stat(self, label, value):
        """Print a key -> value statistic."""
        self._write(f"{self.DIM}{label}:{self.RESET} {self.YELLOW}{value}{self.RESET}")

    def success(self, msg):
        """Print a success message."""
        self._write(f"{self.GREEN}[OK]{self.RESET} {msg}")

    def warn(self, msg):
        """Print a warning message."""
        self._write(f"{self.YELLOW}[!!]{self.RESET} {msg}")

    def error(self, msg):
        """Print an error message."""
        self._write(f"{self.RED}[ERR]{self.RESET} {msg}")

    def done(self, summary=None):
        """Print a section footer."""
        if summary:
            self.raw(f"\n{self.GREEN}{self.BAR}")
            self.raw(f"  [OK] Done -- {summary}")
            self.raw(f"{self.GREEN}{self.BAR}{self.RESET}\n")
        else:
            self.raw(f"\n{self.GREEN}{self.BAR}")
            self.raw(f"  [OK] Done")
            self.raw(f"{self.BAR}{self.RESET}\n")
        self.indent_level = 0

    def indent(self, levels=1):
        """Increase indentation level."""
        self.indent_level += levels
        return self

    def dedent(self, levels=1):
        """Decrease indentation level."""
        self.indent_level = max(0, self.indent_level - levels)
        return self

    def section(self, title=None):
        """Context manager for indented sections."""
        return LogSection(self, title)

    def banner(self):
        """Print the application banner."""
        self.raw(f"{self.PURPLE} $$$$$$\\  $$$$$$$\\  $$$$$$$\\   $$$$$$\\   $$$$$$\\  $$\\   $$\\ $$$$$$$$\\ $$$$$$$$\\   $$$$$$\\ $$$$$$$$\\  $$$$$$\\ $$$$$$$$\\  $$$$$$\\  {self.RESET}")
        self.raw(f"{self.PURPLE}$$  __$$\\ $$  __$$\\ $$  __$$\\ $$  __$$\\ $$  __$$\\ $$ | $$  |$$  _____|\\__$$  __| $$  __$$\\\\__$$  __|$$  __$$\\\\__$$  __|$$  __$$\\ {self.RESET}")
        self.raw(f"{self.PURPLE}$$ /  \\__|$$ |  $$ |$$ |  $$ |$$ /  $$ |$$ /  \\__|$$ |$$  / $$ |         $$ |    $$ /  \\__|  $$ |   $$ /  $$ |  $$ |   $$ /  \\__|{self.RESET}")
        self.raw(f"{self.PURPLE}\\$$$$$$\\  $$$$$$$  |$$$$$$$  |$$ |  $$ |$$ |      $$$$$  /  $$$$$\\       $$ |    \\$$$$$$\\    $$ |   $$$$$$$$ |  $$ |   \\$$$$$$\\  {self.RESET}")
        self.raw(f"{self.PURPLE} \\____$$\\ $$  ____/ $$  __$$< $$ |  $$ |$$ |      $$  $$<   $$  __|      $$ |     \\____$$\\   $$ |   $$  __$$ |  $$ |    \\____$$\\ {self.RESET}")
        self.raw(f"{self.PURPLE}$$\\   $$ |$$ |      $$ |  $$ |$$ |  $$ |$$ |  $$\\ $$ |\\$$\\  $$ |         $$ |    $$\\   $$ |  $$ |   $$ |  $$ |  $$ |   $$\\   $$ |{self.RESET}")
        self.raw(f"{self.PURPLE}\\$$$$$$  |$$ |      $$ |  $$ | $$$$$$  |\\$$$$$$  |$$ | \\$$\\ $$$$$$$$\\    $$ |    \\$$$$$$  |  $$ |   $$ |  $$ |  $$ |   \\$$$$$$  |{self.RESET}")
        self.raw(f"{self.PURPLE} \\______/ \\__|      \\__|  \\__| \\______/  \\______/ \\__|  \\__|\\________|   \\__|     \\______/   \\__|   \\__|  \\__|  \\__|    \\______/ {self.RESET}")


class LogSection:
    """Context manager for indented log sections."""

    def __init__(self, logger, title=None):
        self.logger = logger
        self.title = title

    def __enter__(self):
        if self.title:
            self.logger.step(self.title)
        self.logger.indent()
        return self.logger

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.logger.dedent()
        return False

class ProgressBar:
    """
    ASCII progress bar with dynamic per-update text.
    """

    def __init__(self, logger, total, width=30, prefix=None):
        self.logger = logger
        self.total = max(1, total)
        self.width = width
        self.prefix = prefix or ""
        self.current = 0
        self.message = ""
        self._last_len = 0

    def update(self, value, message=None):
        self.current = min(value, self.total)
        if message is not None:
            self.message = str(message)
        self._render()

    def advance(self, step=1, message=None):
        self.update(self.current + step, message)

    def _render(self):
        ratio = self.current / self.total
        filled = int(self.width * ratio)
        bar = "#" * filled + "-" * (self.width - filled)
        percent = int(ratio * 100)

        indent = " " * (self.logger.indent_level * self.logger.indent_size)

        parts = []
        if self.prefix:
            parts.append(self.prefix)
        parts.append(f"[{bar}]")
        parts.append(f"{percent:3d}%")
        if self.message:
            parts.append(f"- {self.message}")

        line = indent + " ".join(parts)

        # ANSI-safe overwrite - move to start first, then clear, then write
        sys.stderr.write("\x1b[A\r\x1b[K")
        sys.stderr.write(line)
        sys.stderr.flush()

        self._last_len = len(line)

        if self.current >= self.total:
            sys.stderr.write("\n")
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


async def verify_db(log):
    """
    Validate database connectivity and schema integrity.

    Args:
        log: Logger instance for output

    Returns:
        tuple: (ok: bool, errors: list[str])
    """
    global DATABASE_KEY, DATABASE_SCHEMA

    errors = []

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

def _check_dependencies(log):
    """
    Check for required Python packages.

    Args:
        log: Logger instance for output

    Returns:
        list: Missing package names
    """
    missing_packages = []

    try:
        import cv2
    except Exception as e:
        missing_packages.append(f"opencv-python (import failed: {e})")
        log.warn(f"Missing: {Logger.CYAN}opencv-python{Logger.RESET}")

    try:
        import pytesseract
    except ImportError:
        missing_packages.append("pytesseract")
        log.warn(f"Missing: {Logger.CYAN}pytesseract{Logger.RESET}")

    try:
        import PIL
    except ImportError:
        missing_packages.append("Pillow")
        log.warn(f"Missing: {Logger.CYAN}Pillow{Logger.RESET}")

    try:
        import yt_dlp
    except ImportError:
        missing_packages.append("yt-dlp")
        log.warn(f"Missing: {Logger.CYAN}yt-dlp{Logger.RESET}")

    return missing_packages


def python_init():
    """Initialize the Python environment and validate database connectivity."""
    log = Logger()

    global DATABASE_KEY, TBA_API_KEY, FRCScoreTracker, ScoreRegionConfig

    has_errored = False
    got_db_key = False
    errors = []
    warnings = []

    log.header("INITIALIZATION")

    # -- Environment --------------------------------------------------------
    log.step("Checking environment...")

    try:
        env_path = dotenv.find_dotenv()
        dotenv.load_dotenv(env_path, override=True)
        DATABASE_KEY = os.getenv("DATABASE_KEY")
        TBA_API_KEY = os.getenv("TBA_API_KEY")

        if not DATABASE_KEY:
            errors.append("DATABASE_KEY is missing from .env file")
            has_errored = True
            log.error("DATABASE_KEY is missing")
        elif not TBA_API_KEY:
            errors.append("TBA_API_KEY is missing from .env file")
            has_errored = True
            log.error("TBA_API_KEY is missing")
        else:
            got_db_key = True
            log.success("Environment loaded")
    except Exception as e:
        errors.append(str(e))
        has_errored = True
        log.error(f"Environment error: {e}")

    # -- Dependencies -------------------------------------------------------
    log.step("Checking dependencies...")

    missing_packages = _check_dependencies(log)

    if missing_packages:
        errors.append(f"Missing Python packages: {', '.join(missing_packages)}")
        has_errored = True
    else:
        log.success("All dependencies found")

    # -- Database -----------------------------------------------------------
    log.step("Checking database...")

    try:
        if got_db_key:
            ok, db_errors = _loop.run_until_complete(verify_db(log))
            if not ok:
                errors.extend(db_errors)
                has_errored = True
                for err in db_errors:
                    log.error(err)
            else:
                log.success("Database schema verified")
        else:
            errors.append("Database validation skipped (missing DATABASE_KEY)")
            has_errored = True
            log.warn("Database validation skipped")
    except Exception as e:
        errors.append(f"verify_db failed: {e}")
        has_errored = True
        log.error(f"verify_db failed: {e}")

    # -- Score tracker library ----------------------------------------------
    if not has_errored:
        try:
            from frc_score_tracker_lib import FRCScoreTracker as _Tracker, ScoreRegionConfig as _Config
            FRCScoreTracker = _Tracker
            ScoreRegionConfig = _Config
            log.success("FRC score tracker loaded")
        except ImportError:
            warnings.append("FRC score tracker library not available")
            log.warn("FRC score tracker library not available")

    # -- Banner & summary --------------------------------------------------
    time.sleep(1)
    log.raw(f"\x1b[2J{Logger.DIM}v26.1.0 pre.1{Logger.RESET}")
    log.banner()
    log.raw("")
    log.raw(f"  {Logger.DIM}Use list_globals() to see available functions{Logger.RESET}")
    log.raw("")

    if has_errored:
        for err in errors:
            log.error(err)
        log.raw(f"\n  {Logger.YELLOW}[!!] Initialization complete with errors{Logger.RESET}\n")
    else:
        log.raw(f"  {Logger.GREEN}[OK] Initialization complete{Logger.RESET}\n")

    return {"errors": errors, "warnings": warnings, "success": not has_errored}


# ============================================================================
# DATA OPERATIONS
# ============================================================================

async def download_data(event_key):
    """Download scouting data from the database."""
    log = Logger()

    global downloaded_data

    log.header("DOWNLOAD DATA")

    try:
        log.step("Connecting to database...")
        conn = await get_connection()
        log.success("Database connected")

        event_name = event_key or "all events"
        log.step(f"Fetching data from {Logger.CYAN}{event_name}{Logger.RESET}")
        event_filter = f"%{event_key}%" if event_key else None

        # -- Match scouting -------------------------------------------------
        with log.section("Fetching match scouting"):
            # 1) Build filter
            event_filter = f"%{event_key}%" if event_key else None

            # 2) Get total row count (for progress bar)
            total = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM match_scouting
                WHERE status = 'submitted'
                  AND ($1::text IS NULL OR event_key LIKE $1)
                """,
                event_filter,
            )

            bar = ProgressBar(
                logger=log,
                total=total,
                prefix="Match scouting",
            )

            # 3) Stream rows
            match_query = """
                          SELECT event_key, match, match_type, team, alliance, scouter, data
                          FROM match_scouting
                          WHERE status = 'submitted'
                            AND ($1::text IS NULL \
                             OR event_key LIKE $1)
                          ORDER BY match_type, match, alliance, team \
                          """

            match = []

            async with conn.transaction():
                async for r in conn.cursor(match_query, event_filter, prefetch=500):
                    match.append(dict(r))
                    bar.advance(message=f"{bar.current + 1}/{total} rows")

        # -- Pit scouting --------------------------------------------------
        with log.section("Fetching pit scouting"):
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
            log.stat("Pit entries", len(pit))

        # -- Match schedules -----------------------------------------------
        with log.section("Fetching match schedules"):
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
            log.stat("Schedule entries", len(all_matches))

        # -- Store & return ------------------------------------------------
        downloaded_data = {
            "match_scouting": match,
            "pit_scouting": pit,
            "all_matches": all_matches,
        }

        total_records = total + len(pit) + len(all_matches)
        await conn.close()

        log.done(f"{Logger.YELLOW}{total_records}{Logger.RESET} total records")
        return {"success": True, "records": total_records}

    except Exception as e:
        log.error(str(e))
        return {"success": False, "error": str(e)}


async def upload_data(event_key):
    """Upload calculation results to the database."""
    log = Logger()

    log.header("UPLOAD DATA")

    if not calc_result or "result" not in calc_result:
        log.error("No calculator output found -- run calculation first")
        return {"success": False, "error": "No calculation results"}

    try:
        log.step("Connecting to database...")
        conn = await get_connection()
        log.success("Database connected")

        if not event_key:
            log.error("Event key is required for upload")
            return {"success": False, "error": "Event key required"}

        log.step(f"Uploading to {Logger.CYAN}{event_key}{Logger.RESET}...")

        await conn.execute(
            "INSERT INTO processed_data (event_key, data) VALUES ($1, $2)",
            event_key,
            json.dumps(calc_result["result"]),
        )

        result = calc_result["result"]
        record_count = len(result) if isinstance(result, (list, dict)) else 1
        log.stat("Records uploaded", record_count)

        await conn.close()

        log.done(f"{Logger.YELLOW}{record_count}{Logger.RESET} records uploaded to {Logger.CYAN}{event_key}{Logger.RESET}")
        return {"success": True, "records": record_count}

    except Exception as e:
        log.error(str(e))
        return {"success": False, "error": str(e)}


# ============================================================================
# CALCULATION ENGINE
# ============================================================================

def validate_downloaded_data(event_key, log, stop_on_warning=False):
    """
    Validate that downloaded_data contains necessary information.

    Args:
        event_key: Event key to validate data for
        log: Logger instance for output
        stop_on_warning: Whether to fail on warnings

    Returns:
        bool: True if validation passed
    """
    global downloaded_data

    if not downloaded_data:
        log.error("No data downloaded -- run download_data() first")
        return False

    required_keys = ["match_scouting", "pit_scouting", "all_matches"]
    missing_keys = [k for k in required_keys if k not in downloaded_data]

    if missing_keys:
        log.error(f"Missing data keys: {', '.join(missing_keys)}")
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

    log.stat("Match scouting entries", len(match_scouting))
    log.stat("Pit scouting entries", len(pit_scouting))
    log.stat("Match schedules", len(all_matches))

    if len(match_scouting) == 0:
        log.warn("No match scouting data for this event")
        if stop_on_warning:
            return False

    if len(all_matches) == 0:
        log.warn("No match schedules for this event")
        if stop_on_warning:
            return False

    return True


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


def determine_most_recent_match(match_scouting, calc_result, log):
    """
    Determine the most recent match based on submissions.

    Args:
        match_scouting: List of match scouting entries
        calc_result: Calculation result dictionary
        log: Logger instance for output

    Returns:
        str: Most recent match key, or None
    """
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


def initialize_structure(calc_result, tba_data, sb_data, downloaded_data, event_key, log, stop_on_warning=False):
    """
    Initialize empty calculation structures for teams and matches.

    Args:
        calc_result: Dictionary to populate with structure
        tba_data: TBA match data
        sb_data: Statbotics data
        downloaded_data: Downloaded scouting data
        event_key: Event key being processed
        log: Logger instance for output
        stop_on_warning: Whether to fail on warnings

    Returns:
        bool: True if initialization succeeded
    """
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

    log.step("Initializing teams and matches from TBA...")

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

    log.stat("Matches initialized", len(calc_result["match"]))
    log.stat("Teams initialized", len(calc_result["team"]))

    sb_match_keys = set(sb_matches.keys())
    missing_in_sb = tba_match_keys - sb_match_keys
    extra_in_sb = sb_match_keys - tba_match_keys

    if missing_in_sb:
        log.warn(f"{len(missing_in_sb)} TBA matches missing in Statbotics")
        if stop_on_warning:
            return False

    if extra_in_sb:
        log.warn(f"{len(extra_in_sb)} Statbotics matches not in TBA")
        if stop_on_warning:
            return False

    log.step("Validating against downloaded data...")

    match_scouting = [
        m for m in downloaded_data.get("match_scouting", [])
        if m.get("event_key") == event_key
    ]

    most_recent = determine_most_recent_match(match_scouting, calc_result, log)
    if most_recent:
        calc_result["most_recent_match"] = most_recent
        log.substep(f"Most recent match identified: {Logger.GREEN}{most_recent}{Logger.RESET}")
    else:
        log.substep(f"No match with >3 submissions found")

    log.success("Structure initialization complete")
    return True


def one_var_stats(data):
    """
    Calculate descriptive statistics for a list of numbers.
    Returns Minitab-style summary statistics.

    Args:
        data: List of numeric values

    Returns:
        dict: Statistical summary including mean, median, std dev, min, max, etc.
    """
    if not data:
        return {
            "n": 0,
            "mean": None,
            "median": None,
            "std_dev": None,
            "min": None,
            "max": None,
            "q1": None,
            "q3": None,
            "iqr": None
        }

    sorted_data = sorted(data)
    n = len(data)

    return {
        "n": n,
        "mean": statistics.mean(data),
        "median": statistics.median(data),
        "std_dev": statistics.stdev(data) if n > 1 else 0,
        "min": min(data),
        "max": max(data),
        "q1": statistics.quantiles(data, n=4)[0] if n >= 4 else None,
        "q3": statistics.quantiles(data, n=4)[2] if n >= 4 else None,
        # Could add: mode, range, variance, skewness, etc.
    }


def run_calculation(setting):
    """Execute scouting data calculations."""
    log = Logger()

    global calc_result, downloaded_data

    log.header("CALCULATION")

    try:
        setting = json.loads(setting) if isinstance(setting, str) else setting

        if not setting.get("event_key"):
            log.error("Event key is required")
            return {"success": False, "error": "Event key required"}

        event_key = setting["event_key"]
        stop_on_warning = setting.get("stop_on_warning", False)

        log.step(f"Running calculations for {Logger.CYAN}{event_key}{Logger.RESET}")
        if stop_on_warning:
            log.substep(f"Stop on warning: {Logger.YELLOW}enabled{Logger.RESET}")

        # -- Validate local data -------------------------------------------
        with log.section("Validating downloaded data"):
            if not validate_downloaded_data(event_key, log, stop_on_warning):
                log.error("Data validation failed")
                return {"success": False, "error": "Data validation failed"}
            log.success("Data validated")

        # -- Statbotics ----------------------------------------------------
        with log.section("Fetching Statbotics data"):
            try:
                sb_data = sb.get_matches(event=event_key)
                sb_count = len(sb_data) if isinstance(sb_data, (list, dict)) else 0

                if sb_count == 0:
                    log.warn("No Statbotics data returned")
                    if stop_on_warning:
                        return {"success": False, "error": "No Statbotics data"}
                else:
                    log.stat("Statbotics entries", sb_count)
            except UserWarning as e:
                log.warn(f"Statbotics error: {e}")
                if stop_on_warning:
                    return {"success": False, "error": f"Statbotics error: {e}"}
                sb_data = {}

        # -- TBA -----------------------------------------------------------
        with log.section("Fetching TBA data"):
            tba_response = requests.get(
                f"https://www.thebluealliance.com/api/v3/event/{event_key}/matches",
                headers={"X-TBA-Auth-Key": TBA_API_KEY}
            )

            if tba_response.status_code != 200:
                log.error(f"TBA request failed (status {tba_response.status_code})")
                if stop_on_warning:
                    return {"success": False, "error": "TBA request failed"}
                tba_data = []
            else:
                tba_data = tba_response.json()
                if not tba_data:
                    log.warn("No TBA matches returned")
                    if stop_on_warning:
                        return {"success": False, "error": "No TBA data"}
                else:
                    log.stat("TBA matches", len(tba_data))

        # -- Initialize result structure -----------------------------------
        with log.section("Initializing calculation results"):
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
                    log=log,
                    stop_on_warning=stop_on_warning
            ):
                log.error("Structure initialization failed")
                return {"success": False, "error": "Structure initialization failed"}

        log.warn("No calculations yet")
        log.done()
        return {"success": True}

    except Exception as e:
        log.error(str(e))
        return {"success": False, "error": str(e)}


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def list_globals():
    """List all functions and variables in the global scope."""
    log = Logger()

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

    log.raw(f"\n{Logger.CYAN}Functions:{Logger.RESET}")
    for f in sorted(functions):
        log.raw(f"  {Logger.DIM}-{Logger.RESET} {f}")

    log.raw(f"{Logger.YELLOW}Classes:{Logger.RESET}")
    for c in sorted(classes):
        log.raw(f"  {Logger.DIM}-{Logger.RESET} {c}")

    log.raw(f"{Logger.GREEN}Variables:{Logger.RESET}")
    for v in sorted(variables):
        log.raw(f"  {Logger.DIM}-{Logger.RESET} {v}")

    log.raw("use inspect_object() to get more information about anything listed.")


def inspect_object(obj, name=None):
    """Inspect and log detailed information about an object."""
    log = Logger()
    import inspect

    # Get a short name representation
    if name:
        obj_name = name
    elif hasattr(obj, '__name__'):
        obj_name = obj.__name__
    else:
        obj_name = f"<{type(obj).__name__} object>"

    obj_type = type(obj).__name__

    log.raw(f"\n{Logger.CYAN}Inspecting: {Logger.RESET}{obj_name} {Logger.DIM}({obj_type}){Logger.RESET}")
    log.raw(f"{Logger.DIM}{Logger.BAR}{Logger.RESET}")

    # Basic info
    log.raw(f"{Logger.YELLOW}Type:{Logger.RESET} {type(obj)}")
    log.raw(f"{Logger.YELLOW}Module:{Logger.RESET} {getattr(obj, '__module__', 'N/A')}")

    # For functions
    if isinstance(obj, types.FunctionType):
        sig = inspect.signature(obj)
        log.raw(f"{Logger.YELLOW}Signature:{Logger.RESET} {obj_name}{sig}")

        doc = inspect.getdoc(obj)
        if doc:
            log.raw(f"{Logger.YELLOW}Docstring:{Logger.RESET}")
            for line in doc.split('\n'):
                log.raw(f"  {Logger.DIM}|{Logger.RESET} {line}")

        # Source file location
        try:
            source_file = inspect.getfile(obj)
            source_lines = inspect.getsourcelines(obj)
            log.raw(f"{Logger.YELLOW}Defined at:{Logger.RESET} {source_file}:{source_lines[1]}")
        except:
            pass

    # For classes
    elif isinstance(obj, type):
        log.raw(f"{Logger.YELLOW}Base classes:{Logger.RESET} {', '.join(c.__name__ for c in obj.__bases__)}")

        doc = inspect.getdoc(obj)
        if doc:
            log.raw(f"{Logger.YELLOW}Docstring:{Logger.RESET}")
            for line in doc.split('\n')[:3]:
                log.raw(f"  {Logger.DIM}|{Logger.RESET} {line}")

        # Methods and attributes
        methods = [m for m in dir(obj) if not m.startswith('_') and callable(getattr(obj, m))]
        if methods:
            log.raw(f"{Logger.YELLOW}Methods:{Logger.RESET}")
            for m in sorted(methods)[:10]:
                log.raw(f"  {Logger.DIM}-{Logger.RESET} {m}")
            if len(methods) > 10:
                log.raw(f"  {Logger.DIM}... and {len(methods) - 10} more{Logger.RESET}")

        attrs = [a for a in dir(obj) if not a.startswith('_') and not callable(getattr(obj, a))]
        if attrs:
            log.raw(f"{Logger.YELLOW}Attributes:{Logger.RESET}")
            for a in sorted(attrs)[:10]:
                log.raw(f"  {Logger.DIM}-{Logger.RESET} {a}")
            if len(attrs) > 10:
                log.raw(f"  {Logger.DIM}... and {len(attrs) - 10} more{Logger.RESET}")

    # For dictionaries
    elif isinstance(obj, dict):
        log.raw(f"{Logger.YELLOW}Length:{Logger.RESET} {len(obj)} items")
        if obj:
            log.raw(f"{Logger.YELLOW}Keys (first 10):{Logger.RESET}")
            for k in list(obj.keys())[:10]:
                v_repr = repr(obj[k])
                if len(v_repr) > 50:
                    v_repr = v_repr[:47] + '...'
                log.raw(f"  {Logger.DIM}-{Logger.RESET} {k}: {v_repr}")
            if len(obj) > 10:
                log.raw(f"  {Logger.DIM}... and {len(obj) - 10} more{Logger.RESET}")

    # For lists/tuples
    elif isinstance(obj, (list, tuple)):
        log.raw(f"{Logger.YELLOW}Length:{Logger.RESET} {len(obj)} items")
        if obj:
            log.raw(f"{Logger.YELLOW}Items (first 10):{Logger.RESET}")
            for i, item in enumerate(obj[:10]):
                item_repr = repr(item)
                if len(item_repr) > 60:
                    item_repr = item_repr[:57] + '...'
                log.raw(f"  {Logger.DIM}[{i}]{Logger.RESET} {item_repr}")
            if len(obj) > 10:
                log.raw(f"  {Logger.DIM}... and {len(obj) - 10} more{Logger.RESET}")

    # For instances
    elif hasattr(obj, '__dict__'):
        log.raw(f"{Logger.YELLOW}Instance of:{Logger.RESET} {obj.__class__.__name__}")

        attrs = {k: v for k, v in obj.__dict__.items() if not k.startswith('_')}
        if attrs:
            log.raw(f"{Logger.YELLOW}Attributes:{Logger.RESET}")
            for k, v in sorted(attrs.items())[:10]:
                v_repr = repr(v)
                if len(v_repr) > 50:
                    v_repr = v_repr[:47] + '...'
                log.raw(f"  {Logger.DIM}-{Logger.RESET} {k}: {v_repr}")
            if len(attrs) > 10:
                log.raw(f"  {Logger.DIM}... and {len(attrs) - 10} more{Logger.RESET}")

    # For simple values
    else:
        val_repr = repr(obj)
        if len(val_repr) > 100:
            val_repr = val_repr[:97] + '...'
        log.raw(f"{Logger.YELLOW}Value:{Logger.RESET} {val_repr}")

    log.raw(f"{Logger.DIM}{Logger.BAR}{Logger.RESET}\n")


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
    """Execute or evaluate Python code in the REPL environment."""
    log = Logger()

    try:
        REPL_GLOBALS["print"] = log.raw

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
        log = Logger()
        ok, errors = _loop.run_until_complete(verify_db(log))
        return _ok(valid=ok, errors=errors)

    if cmd == "list_globals":
        list_globals()
        return _ok()

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
